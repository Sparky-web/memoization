import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import {
  CARD_REGENERATIONS_PER_DAY,
  FREE_QUESTIONS_PER_EXAM,
  PRO_QUESTIONS_PER_EXAM,
  startOfDayMsk,
  typo,
  zodRussian,
} from "~/lib";
import { hasActivePro } from "~/server/entitlement";
import { generateFullQuestionAnswers, generateQuestionCards } from "~/server/generation";
import { authMiddleware } from "~/server/middleware";
import { refundUsage, tryChargeUsage } from "~/server/usage";

// Вопросы экзамена: замена списка (мастер/textarea) с сохранением неизменённых строк,
// страница вопроса и точечная перегенерация его карточек (sonnet, без списания квоты
// генераций, но с собственным мягким дневным лимитом — каждый вызов запускает claude).

export const setExamQuestions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      examId: zodRussian.string(),
      questions: zodRussian.array(zodRussian.string().min(1).max(2000)).min(1).max(PRO_QUESTIONS_PER_EXAM),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true, status: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    if (exam.status === "processing") {
      setResponseStatus(409);
      throw new Error(typo("Идёт генерация — дождитесь её окончания, потом меняйте вопросы"));
    }

    const limit = (await hasActivePro(context.db, userId)) ? PRO_QUESTIONS_PER_EXAM : FREE_QUESTIONS_PER_EXAM;
    if (data.questions.length > limit) {
      setResponseStatus(402);
      throw new Error(
        typo(
          `Слишком много вопросов: лимит — ${limit} на экзамен (бесплатно ${FREE_QUESTIONS_PER_EXAM}, в Pro ${PRO_QUESTIONS_PER_EXAM})`,
        ),
      );
    }

    // Дифф по тексту, а не полная замена: неизменённые строки сохраняют вопрос целиком
    // (сгенерированный ответ, тему, привязку карточек) — иначе правка одной строки стирала бы
    // ответы всего экзамена, а Free (одна генерация) не смог бы их вернуть. Удаляются
    // и создаются только реально изменившиеся строки; дубликаты сопоставляются по очереди.
    const existing = await context.db.question.findMany({
      where: { examId: exam.id },
      orderBy: { position: "asc" },
      select: { id: true, text: true, position: true },
    });
    const spareByText = new Map<string, { id: string; position: number }[]>();
    for (const question of existing) {
      const bucket = spareByText.get(question.text);
      if (bucket) {
        bucket.push(question);
      } else {
        spareByText.set(question.text, [question]);
      }
    }
    const matched = data.questions.map((text) => spareByText.get(text)?.shift() ?? null);
    const keptIds = new Set(matched.flatMap((question) => (question ? [question.id] : [])));
    const removedIds = existing.filter((question) => !keptIds.has(question.id)).map((question) => question.id);

    await context.db.$transaction(async (tx) => {
      if (removedIds.length) await tx.question.deleteMany({ where: { id: { in: removedIds } } });
      for (const [index, text] of data.questions.entries()) {
        const kept = matched[index];
        if (!kept) {
          await tx.question.create({ data: { examId: exam.id, position: index, text } });
          continue;
        }
        if (kept.position !== index) {
          await tx.question.update({ where: { id: kept.id }, data: { position: index } });
        }
      }
    });
    return { count: data.questions.length };
  });

export const getQuestionById = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const question = await context.db.question.findFirst({
      where: { id: data.id, exam: { userId: context.session.user.id } },
      select: {
        id: true,
        position: true,
        text: true,
        topic: true,
        answerMd: true,
        covered: true,
        aiGenerated: true,
        sourceRef: true,
        exam: { select: { id: true, title: true } },
        cards: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            format: true,
            kind: true,
            prompt: true,
            answer: true,
            options: true,
            explanation: true,
            sourceRef: true,
            aiGenerated: true,
            flagged: true,
            suspended: true,
          },
        },
      },
    });
    if (!question) {
      setResponseStatus(404);
      throw new Error(typo("Вопрос не найден"));
    }
    return question;
  });

// Сколько соседних вопросов (по позиции, в обе стороны) отдаём модели под дистракторы mcq.
const NEIGHBOR_RADIUS = 2;

export const regenerateQuestionCards = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ questionId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const question = await context.db.question.findFirst({
      where: { id: data.questionId, exam: { userId: context.session.user.id } },
      select: {
        id: true,
        examId: true,
        position: true,
        text: true,
        topic: true,
        answerMd: true,
        aiGenerated: true,
        sourceRef: true,
        exam: { select: { examFormat: true, status: true } },
      },
    });
    if (!question) {
      setResponseStatus(404);
      throw new Error(typo("Вопрос не найден"));
    }
    if (!question.answerMd) {
      setResponseStatus(400);
      throw new Error(typo("У вопроса ещё нет ответа — сначала запустите генерацию экзамена"));
    }
    if (question.exam.status === "processing") {
      setResponseStatus(409);
      throw new Error(typo("Идёт генерация экзамена — дождитесь её окончания"));
    }

    // Мягкий анти-абьюз лимит: без него перегенерацией можно бесплатно пересобирать
    // весь экзамен вопрос за вопросом. Списание атомарное (advisory lock), не квота генераций.
    const charged = await tryChargeUsage(context.db, {
      userId: context.session.user.id,
      kind: "card_regeneration",
      refId: question.id,
      limit: CARD_REGENERATIONS_PER_DAY,
      since: startOfDayMsk(new Date()),
    });
    if (!charged) {
      setResponseStatus(429);
      throw new Error(
        typo(`Дневной лимит перегенераций карточек (${CARD_REGENERATIONS_PER_DAY}) исчерпан — попробуйте завтра`),
      );
    }

    const neighbors = await context.db.question.findMany({
      where: {
        examId: question.examId,
        id: { not: question.id },
        position: { gte: question.position - NEIGHBOR_RADIUS, lte: question.position + NEIGHBOR_RADIUS },
      },
      orderBy: { position: "asc" },
      select: { text: true, answerMd: true },
    });

    let cards;
    try {
      cards = await generateQuestionCards({
        text: question.text,
        topic: question.topic,
        answerMd: question.answerMd,
        examFormat: question.exam.examFormat,
        neighbors,
      });
    } catch (error) {
      // Неудачная перегенерация попытку не сжигает — возвращаем событие (refId = questionId).
      await refundUsage(context.db, "card_regeneration", [question.id]).catch(() => undefined);
      throw error;
    }

    await context.db.$transaction(async (tx) => {
      // Точечная замена: сносим прежние ИИ-карточки вопроса (все привязанные к нему).
      await tx.card.deleteMany({ where: { questionId: question.id } });
      const lastCard = await tx.card.findFirst({
        where: { examId: question.examId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      let cardPosition = (lastCard?.position ?? -1) + 1;
      await tx.card.createMany({
        data: cards.map((card) => {
          const row = {
            examId: question.examId,
            questionId: question.id,
            format: card.format,
            kind: card.kind,
            prompt: card.prompt,
            answer: card.answer,
            options: card.options,
            explanation: card.explanation,
            // «Полный вопрос» несёт полный ответ вопроса развёрнутым разбором.
            deepMd: card.kind === "full" ? question.answerMd : null,
            sourceRef: question.sourceRef,
            aiGenerated: question.aiGenerated,
            position: cardPosition,
          };
          cardPosition += 1;
          return row;
        }),
      });
    });

    return { count: cards.length };
  });

// Бэкфилл «полных вопросов» для существующих экзаменов: на каждый вопрос с ответом,
// но без карточки kind="full", создаётся карточка полного билета. Один батч-вызов sonnet
// на весь экзамен; квота — card_regeneration, одно списание на вызов.
export const addFullQuestionCards = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true, status: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    if (exam.status !== "ready") {
      setResponseStatus(409);
      throw new Error(typo("Экзамен ещё не готов — дождитесь окончания генерации"));
    }

    const questions = await context.db.question.findMany({
      where: { examId: exam.id, answerMd: { not: null }, cards: { none: { kind: "full" } } },
      orderBy: { position: "asc" },
      select: { id: true, text: true, answerMd: true, sourceRef: true, aiGenerated: true },
    });
    if (!questions.length) {
      setResponseStatus(400);
      throw new Error(typo("У всех вопросов с ответами уже есть карточки полного вопроса"));
    }

    // Один живой вызов claude — то же атомарное списание, что у точечной перегенерации.
    const charged = await tryChargeUsage(context.db, {
      userId,
      kind: "card_regeneration",
      refId: exam.id,
      limit: CARD_REGENERATIONS_PER_DAY,
      since: startOfDayMsk(new Date()),
    });
    if (!charged) {
      setResponseStatus(429);
      throw new Error(
        typo(`Дневной лимит перегенераций карточек (${CARD_REGENERATIONS_PER_DAY}) исчерпан — попробуйте завтра`),
      );
    }

    let answers;
    try {
      answers = await generateFullQuestionAnswers(
        questions.map((question) => ({ text: question.text, answerMd: question.answerMd ?? "" })),
      );
    } catch (error) {
      // Неудачный батч попытку не сжигает — возвращаем событие (refId = examId).
      await refundUsage(context.db, "card_regeneration", [exam.id]).catch(() => undefined);
      throw error;
    }
    const answerByPosition = new Map(answers.map((answer) => [answer.position, answer]));

    const created = await context.db.$transaction(async (tx) => {
      const lastCard = await tx.card.findFirst({
        where: { examId: exam.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      let cardPosition = (lastCard?.position ?? -1) + 1;

      const rows = [];
      for (const [index, question] of questions.entries()) {
        const answer = answerByPosition.get(index + 1);
        if (!answer) continue;
        rows.push({
          examId: exam.id,
          questionId: question.id,
          format: "open",
          kind: "full",
          prompt: question.text,
          answer: answer.answer,
          options: [],
          explanation: answer.explanation,
          // Полный ответ вопроса — развёрнутым разбором карточки.
          deepMd: question.answerMd,
          sourceRef: question.sourceRef,
          aiGenerated: question.aiGenerated,
          position: cardPosition,
        });
        cardPosition += 1;
      }
      await tx.card.createMany({ data: rows });
      return rows.length;
    });

    return { count: created };
  });
