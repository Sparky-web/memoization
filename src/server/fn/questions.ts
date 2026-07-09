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
import { generateQuestionCards } from "~/server/generation";
import { authMiddleware } from "~/server/middleware";
import { refundUsage, tryChargeUsage } from "~/server/usage";

// Вопросы экзамена: полная замена списка (мастер/textarea), страница вопроса
// и точечная перегенерация его карточек (sonnet, без списания квоты генераций,
// но с собственным мягким дневным лимитом — каждый вызов запускает claude).

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

    // Полная позиционная замена: старые вопросы удаляются, карточки прошлых генераций
    // теряют привязку (questionId → null) и будут заменены следующей генерацией.
    await context.db.$transaction([
      context.db.question.deleteMany({ where: { examId: exam.id } }),
      context.db.question.createMany({
        data: data.questions.map((text, index) => ({ examId: exam.id, position: index, text })),
      }),
    ]);
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
            prompt: card.prompt,
            answer: card.answer,
            options: card.options,
            explanation: card.explanation,
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
