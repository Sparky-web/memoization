import { type Prisma, type PrismaClient } from "@prisma/client";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import {
  FREE_DECK_GENERATIONS,
  FREE_EXAMS,
  FREE_QUESTIONS_PER_EXAM,
  mskCalendarDaysBetween,
  PAYWALL_ERRORS,
  PRO_DECK_GENERATIONS_PER_DAY,
  PRO_EXAMS,
  PRO_QUESTIONS_PER_EXAM,
  readiness,
  retrievability,
  startOfDayMsk,
  typo,
  zodRussian,
} from "~/lib";
import { auth } from "~/server/auth";
import { hasActivePro } from "~/server/entitlement";
import { cleanupGenerationJob, enqueueGeneration, getGenerationQueuePosition } from "~/server/generation";
import { cleanupExamMaterials } from "~/server/materialStorage";
import { authMiddleware, baseMiddleware } from "~/server/middleware";
import { examReadinessMap } from "~/server/readiness";
import { tryChargeUsage } from "~/server/usage";

// Экзамен — центральная сущность. Всё скоупится по владельцу; публичное — только isPublic
// (превью /d/$examId и форк «Забрать себе» — перенос механики публичных колод).

// Сколько вопросов отдаём в публичном превью по ссылке (остальное — после форка).
const PUBLIC_PREVIEW_LIMIT = 20;

// Дата экзамена приходит строкой «YYYY-MM-DD» и трактуется как календарный день МСК.
const examDateInput = zodRussian
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

function parseExamDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00+03:00`) : null;
}

function daysToExamOf(examDate: Date | null, now: Date): number | null {
  return examDate ? mskCalendarDaysBetween(now, examDate) : null;
}

// Гейт мультиэкзаменов: Free — 1 активный (2-й — пейвол), Pro — до 10 (fair-use).
// Активный = не архивный И не на паузе: пауза освобождает слот, снятие с паузы проходит
// этот же гейт. Вызывается в ОДНОЙ транзакции с созданием/разархивированием под
// advisory-локом по пользователю: параллельные запросы (двойной сабмит, две вкладки)
// сериализуются и не обходят лимит гонкой «прочитали count → записали».
async function assertActiveExamCapacity(
  tx: Prisma.TransactionClient,
  userId: string,
  pro: boolean,
  addedCount: number,
): Promise<void> {
  // ::text — pg_advisory_xact_lock возвращает void, который Prisma не умеет десериализовать.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:active_exams`}, 0))::text`;
  const activeCount = await tx.exam.count({ where: { userId, archivedAt: null, pausedAt: null } });
  if (!pro && activeCount + addedCount > FREE_EXAMS) {
    setResponseStatus(402);
    throw new Error(PAYWALL_ERRORS.MULTI_EXAM);
  }
  if (pro && activeCount + addedCount > PRO_EXAMS) {
    setResponseStatus(402);
    throw new Error(typo(`В Pro можно вести до ${PRO_EXAMS} активных экзаменов — заархивируйте прошедшие`));
  }
}

// Лимит вопросов на экзамен по тарифу — тот же, что в setExamQuestions: применяется
// и к форку, и к запуску генерации (defense-in-depth против обхода через готовые данные).
function questionLimitOf(pro: boolean): number {
  return pro ? PRO_QUESTIONS_PER_EXAM : FREE_QUESTIONS_PER_EXAM;
}

export const getExams = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const now = new Date();

    const exams = await context.db.exam.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        examDate: true,
        status: true,
        generationError: true,
        mode: true,
        isPublic: true,
        archivedAt: true,
        pausedAt: true,
        createdAt: true,
        _count: { select: { cards: true, questions: true } },
      },
    });

    const readinessByExam = await examReadinessMap(
      context.db,
      userId,
      exams.map((exam) => exam.id),
      now,
    );

    return exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      examDate: exam.examDate,
      daysToExam: daysToExamOf(exam.examDate, now),
      status: exam.status,
      generationError: exam.generationError,
      mode: exam.mode,
      isPublic: exam.isPublic,
      archivedAt: exam.archivedAt,
      pausedAt: exam.pausedAt,
      createdAt: exam.createdAt,
      totalCards: exam._count.cards,
      totalQuestions: exam._count.questions,
      readiness: readinessByExam.get(exam.id) ?? 0,
      // Позиция в очереди генерации: 0 — генерируется сейчас, ≥1 — ждёт очереди, null — не в очереди.
      queuePosition: exam.status === "processing" ? getGenerationQueuePosition(exam.id) : null,
    }));
  });

export const getExamById = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const now = new Date();
    const exam = await context.db.exam.findFirst({
      where: { id: data.id, userId },
      select: {
        id: true,
        title: true,
        description: true,
        examDate: true,
        targetGrade: true,
        dailyMinutes: true,
        examFormat: true,
        status: true,
        generationError: true,
        mode: true,
        isPublic: true,
        archivedAt: true,
        pausedAt: true,
        createdAt: true,
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            text: true,
            topic: true,
            covered: true,
            aiGenerated: true,
            sourceRef: true,
            answerMd: true,
            _count: { select: { cards: true } },
          },
        },
        materials: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }

    // Карточки с прогрессом — для счётчиков и готовности по темам (тема — у вопроса карточки).
    const cards = await context.db.card.findMany({
      where: { examId: exam.id },
      select: {
        id: true,
        format: true,
        kind: true,
        suspended: true,
        flagged: true,
        question: { select: { id: true, topic: true } },
        progress: {
          where: { userId },
          select: {
            stability: true,
            difficulty: true,
            due: true,
            state: true,
            reps: true,
            lapses: true,
            lastReviewedAt: true,
          },
        },
      },
    });

    const activeCards = cards.filter((card) => !card.suspended);
    const retrievabilityOf = (card: (typeof cards)[number]) => {
      const progress = card.progress[0];
      return progress ? retrievability(progress, now) : 0;
    };

    const byTopic = new Map<string, { retrievability: number }[]>();
    for (const card of activeCards) {
      const key = card.question?.topic ?? "";
      const bucket = byTopic.get(key);
      const entry = { retrievability: retrievabilityOf(card) };
      if (bucket) {
        bucket.push(entry);
      } else {
        byTopic.set(key, [entry]);
      }
    }
    const topics = [...byTopic.entries()].map(([topic, entries]) => ({
      topic: topic || null,
      cardCount: entries.length,
      readiness: readiness(entries),
    }));

    const formatCounts = { open: 0, mcq: 0, cloze: 0, truefalse: 0 };
    for (const card of activeCards) {
      if (card.format === "open") formatCounts.open += 1;
      if (card.format === "mcq") formatCounts.mcq += 1;
      if (card.format === "cloze") formatCounts.cloze += 1;
      if (card.format === "truefalse") formatCounts.truefalse += 1;
    }

    const dueCount = activeCards.filter((card) => {
      const progress = card.progress[0];
      return progress ? progress.due <= now : false;
    }).length;
    const newCount = activeCards.filter((card) => !card.progress.length).length;

    // Вопросы с ответом, но без карточки «полный вопрос» — кандидаты бэкфилла (баннер хаба).
    const fullCardQuestionIds = new Set(
      cards.flatMap((card) => (card.kind === "full" && card.question ? [card.question.id] : [])),
    );
    const questionsWithoutFullCard = exam.questions.filter(
      (question) => question.answerMd && !fullCardQuestionIds.has(question.id),
    ).length;

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      examDate: exam.examDate,
      daysToExam: daysToExamOf(exam.examDate, now),
      targetGrade: exam.targetGrade,
      dailyMinutes: exam.dailyMinutes,
      examFormat: exam.examFormat,
      status: exam.status,
      generationError: exam.generationError,
      mode: exam.mode,
      isPublic: exam.isPublic,
      archivedAt: exam.archivedAt,
      pausedAt: exam.pausedAt,
      createdAt: exam.createdAt,
      queuePosition: exam.status === "processing" ? getGenerationQueuePosition(exam.id) : null,
      questions: exam.questions.map((question) => ({
        id: question.id,
        position: question.position,
        text: question.text,
        topic: question.topic,
        covered: question.covered,
        aiGenerated: question.aiGenerated,
        sourceRef: question.sourceRef,
        hasAnswer: Boolean(question.answerMd),
        cardCount: question._count.cards,
      })),
      materials: exam.materials,
      topics,
      questionsWithoutFullCard,
      readiness: readiness(activeCards.map((card) => ({ retrievability: retrievabilityOf(card) }))),
      counters: {
        totalCards: cards.length,
        suspended: cards.length - activeCards.length,
        flagged: cards.filter((card) => card.flagged).length,
        due: dueCount,
        new: newCount,
        byFormat: formatCounts,
      },
    };
  });

const draftExamInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  examDate: examDateInput,
});

// Черновики экзаменов пачкой (мастер создаёт несколько за раз). Free видит пейвол на 2-м активном.
export const createExamsDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ exams: zodRussian.array(draftExamInput).min(1).max(10) }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const pro = await hasActivePro(context.db, userId);

    return context.db.$transaction(async (tx) => {
      await assertActiveExamCapacity(tx, userId, pro, data.exams.length);
      const created: { id: string; title: string }[] = [];
      for (const draft of data.exams) {
        const exam = await tx.exam.create({
          data: {
            userId,
            title: draft.title,
            examDate: parseExamDate(draft.examDate),
            status: "draft",
          },
          select: { id: true, title: true },
        });
        created.push(exam);
      }
      return created;
    });
  });

const examFieldsInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200).optional(),
  description: zodRussian.string().max(2000).nullable().optional(),
  examDate: examDateInput.optional(),
  targetGrade: zodRussian.string().max(50).nullable().optional(),
  dailyMinutes: zodRussian.number().int().min(5).max(240).optional(),
  examFormat: zodRussian.enum(["oral", "written", "test"]).nullable().optional(),
  mode: zodRussian.enum(["long", "cram"]).optional(),
});

export const updateExam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), data: examFieldsInput }))
  .handler(async ({ data: input, context }) => {
    const userId = context.session.user.id;
    // Умная зубрёжка — Pro (защита сна и спринты живут поверх этого режима).
    if (input.data.mode === "cram" && !(await hasActivePro(context.db, userId))) {
      setResponseStatus(402);
      throw new Error(PAYWALL_ERRORS.CRAM);
    }
    const result = await context.db.exam.updateMany({
      where: { id: input.id, userId },
      data: {
        ...(input.data.title !== undefined ? { title: input.data.title } : {}),
        ...(input.data.description !== undefined ? { description: input.data.description } : {}),
        ...(input.data.examDate !== undefined ? { examDate: parseExamDate(input.data.examDate) } : {}),
        ...(input.data.targetGrade !== undefined ? { targetGrade: input.data.targetGrade } : {}),
        ...(input.data.dailyMinutes !== undefined ? { dailyMinutes: input.data.dailyMinutes } : {}),
        ...(input.data.examFormat !== undefined ? { examFormat: input.data.examFormat } : {}),
        ...(input.data.mode !== undefined ? { mode: input.data.mode } : {}),
      },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    return true;
  });

// Разархивирование проходит тот же гейт активных экзаменов, что и создание, — под локом.
async function setExamArchived(
  db: PrismaClient,
  userId: string,
  examId: string,
  archived: boolean,
): Promise<{ count: number }> {
  if (archived) {
    return db.exam.updateMany({ where: { id: examId, userId }, data: { archivedAt: new Date() } });
  }
  const pro = await hasActivePro(db, userId);
  return db.$transaction(async (tx) => {
    await assertActiveExamCapacity(tx, userId, pro, 1);
    return tx.exam.updateMany({ where: { id: examId, userId }, data: { archivedAt: null } });
  });
}

// Пауза: экзамен выпадает из плана дня и предложений, но не архивируется. Снятие с паузы
// проходит тот же гейт активных экзаменов, что и создание/разархивирование, — под локом.
export const setExamPaused = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), paused: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const result = await (async () => {
      if (data.paused) {
        return context.db.exam.updateMany({
          where: { id: data.id, userId, pausedAt: null },
          data: { pausedAt: new Date() },
        });
      }
      const pro = await hasActivePro(context.db, userId);
      return context.db.$transaction(async (tx) => {
        const exam = await tx.exam.findFirst({ where: { id: data.id, userId }, select: { pausedAt: true } });
        // Уже не на паузе — не занимаем слот повторно (даблклик/две вкладки).
        if (exam && !exam.pausedAt) return { count: 1 };
        await assertActiveExamCapacity(tx, userId, pro, 1);
        return tx.exam.updateMany({ where: { id: data.id, userId }, data: { pausedAt: null } });
      });
    })();
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    return { paused: data.paused };
  });

// Архив «после экзамена».
export const archiveExam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), archived: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const result = await setExamArchived(context.db, context.session.user.id, data.id, data.archived);
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    return true;
  });

export const deleteExam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.exam.deleteMany({
      where: { id: data.id, userId: context.session.user.id },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    // Материалы генерации хранились для ретрая — вместе с экзаменом они больше не нужны.
    cleanupGenerationJob(data.id);
    // Файлы загруженных материалов: записи Material удалил каскад, каталог чистим сами.
    cleanupExamMaterials(data.id);
    return true;
  });

const GENERATION_FAIR_USE_ERROR = typo("Дневной fair-use лимит генераций исчерпан — попробуйте завтра");

// Запуск двухпроходной генерации (ответы → карточки). Перегенерация — полная: джоба заменит
// ответы вопросов и удалит прежние ИИ-карточки (ручные останутся) — предупреждение в confirm UI.
export const generateExam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true, status: true, _count: { select: { questions: true } } },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    if (!exam._count.questions) {
      setResponseStatus(400);
      throw new Error(typo("Сначала добавьте вопросы к экзамену"));
    }
    const pro = await hasActivePro(context.db, userId);
    // Defense-in-depth: лимит вопросов тарифа проверяется и на запуске генерации — иначе
    // экзамен, получивший вопросы в обход setExamQuestions (форк, даунгрейд тарифа),
    // запускал бы opus-джобу на числе вопросов много выше потолка тарифа.
    const questionLimit = questionLimitOf(pro);
    if (exam._count.questions > questionLimit) {
      setResponseStatus(402);
      throw new Error(
        typo(
          `Слишком много вопросов для генерации: лимит — ${questionLimit} на экзамен (бесплатно ${FREE_QUESTIONS_PER_EXAM}, в Pro ${PRO_QUESTIONS_PER_EXAM})`,
        ),
      );
    }

    // Гонкоустойчивый переход в processing: второй параллельный клик не запустит вторую джобу.
    const flipped = await context.db.exam.updateMany({
      where: { id: exam.id, status: { in: ["draft", "failed", "ready"] } },
      data: { status: "processing", generationError: null },
    });
    if (!flipped.count) {
      setResponseStatus(409);
      throw new Error(typo("Генерация уже идёт"));
    }

    // Попытка списывается до постановки в очередь атомарно (advisory lock в tryChargeUsage);
    // при провале генерации джоба вернёт её (refundUsage по refId = examId).
    let charged: boolean;
    try {
      charged = pro
        ? await tryChargeUsage(context.db, {
            userId,
            kind: "deck_generation",
            refId: exam.id,
            limit: PRO_DECK_GENERATIONS_PER_DAY,
            since: startOfDayMsk(new Date()),
          })
        : await tryChargeUsage(context.db, {
            userId,
            kind: "deck_generation",
            refId: exam.id,
            limit: FREE_DECK_GENERATIONS,
          });
    } catch (error) {
      // Неожиданная ошибка списания не должна оставить экзамен висеть в processing.
      await context.db.exam.update({ where: { id: exam.id }, data: { status: exam.status } }).catch(() => undefined);
      throw error;
    }
    if (!charged) {
      // Лимит исчерпан — возвращаем экзамену прежний статус, генерация не стартует.
      await context.db.exam.update({ where: { id: exam.id }, data: { status: exam.status } });
      setResponseStatus(402);
      throw new Error(pro ? GENERATION_FAIR_USE_ERROR : PAYWALL_ERRORS.GENERATION);
    }

    enqueueGeneration(exam.id);
    return { queuePosition: getGenerationQueuePosition(exam.id) };
  });

// Публикация: экзамен доступен по ссылке /d/:id. Снятие публикации отзывает избранное.
export const setExamPublic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), isPublic: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.exam.updateMany({
      where: { id: data.id, userId: context.session.user.id },
      data: { isPublic: data.isPublic },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    if (!data.isPublic) {
      await context.db.examFavorite.deleteMany({ where: { examId: data.id } });
    }
    return { isPublic: data.isPublic };
  });

// Публичная страница экзамена: доступна без входа (read-only превью). Сессию читаем опционально —
// кнопки зависят от того, кто смотрит.
export const getPublicExam = createServerFn({ method: "GET" })
  .middleware([baseMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const session = await auth.api.getSession({ headers: new Headers(getRequestHeaders()) });
    const viewerId = session?.user.id ?? null;

    const exam = await context.db.exam.findFirst({
      where: { id: data.id },
      select: {
        id: true,
        title: true,
        description: true,
        examDate: true,
        isPublic: true,
        userId: true,
        user: { select: { name: true } },
        _count: { select: { cards: true, questions: true } },
        questions: {
          orderBy: { position: "asc" },
          take: PUBLIC_PREVIEW_LIMIT,
          select: { id: true, text: true, topic: true },
        },
      },
    });
    const isOwner = !!viewerId && exam?.userId === viewerId;
    if (!exam || (!exam.isPublic && !isOwner)) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден или недоступен"));
    }

    const favorite =
      viewerId && !isOwner
        ? await context.db.examFavorite.findUnique({
            where: { userId_examId: { userId: viewerId, examId: exam.id } },
            select: { id: true },
          })
        : null;

    return {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      examDate: exam.examDate,
      authorName: exam.user.name,
      totalCards: exam._count.cards,
      totalQuestions: exam._count.questions,
      questions: exam.questions,
      isOwner,
      isAuthenticated: Boolean(viewerId),
      isFavorite: Boolean(favorite),
    };
  });

// Форк «Забрать себе»: копия Exam + Questions + Cards под своим userId, со своей датой и прогрессом с нуля.
export const forkExam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), examDate: examDateInput }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const source = await context.db.exam.findFirst({
      where: { id: data.id, isPublic: true },
      select: {
        id: true,
        title: true,
        description: true,
        userId: true,
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            position: true,
            text: true,
            topic: true,
            answerMd: true,
            covered: true,
            aiGenerated: true,
            sourceRef: true,
          },
        },
        cards: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            format: true,
            prompt: true,
            answer: true,
            options: true,
            explanation: true,
            deepMd: true,
            mnemonic: true,
            sourceRef: true,
            aiGenerated: true,
            suspended: true,
            position: true,
            questionId: true,
          },
        },
      },
    });
    if (!source) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен недоступен для копирования"));
    }
    if (source.userId === userId) {
      setResponseStatus(400);
      throw new Error(typo("Это ваш экзамен — он и так у вас есть"));
    }
    const pro = await hasActivePro(context.db, userId);
    // Лимит вопросов тарифа действует и на форк: без него Free забирал бы готовый экзамен
    // Pro-автора на 300 вопросов в обход гейта (и мог перегенерировать его целиком).
    const questionLimit = questionLimitOf(pro);
    if (source.questions.length > questionLimit) {
      setResponseStatus(402);
      throw new Error(
        typo(
          `В этом экзамене ${source.questions.length} вопросов — на вашем тарифе доступно до ${questionLimit}. Pro поднимает лимит до ${PRO_QUESTIONS_PER_EXAM} вопросов на экзамен`,
        ),
      );
    }

    // Таймаут транзакции выше дефолтных 5 секунд: копирование до 300 вопросов идёт
    // последовательными insert'ами (нужна карта старый id → новый id для карточек).
    const forked = await context.db.$transaction(
      async (tx) => {
        await assertActiveExamCapacity(tx, userId, pro, 1);
        const exam = await tx.exam.create({
          data: {
            userId,
            title: source.title,
            description: source.description,
            examDate: parseExamDate(data.examDate),
            status: "ready",
          },
          select: { id: true },
        });

        // Вопросы копируются с новой картой id — карточки привязываются к копиям.
        const questionIdMap = new Map<string, string>();
        for (const question of source.questions) {
          const copy = await tx.question.create({
            data: {
              examId: exam.id,
              position: question.position,
              text: question.text,
              topic: question.topic,
              answerMd: question.answerMd,
              covered: question.covered,
              aiGenerated: question.aiGenerated,
              sourceRef: question.sourceRef,
            },
            select: { id: true },
          });
          questionIdMap.set(question.id, copy.id);
        }

        await tx.card.createMany({
          data: source.cards.map((card) => ({
            examId: exam.id,
            format: card.format,
            prompt: card.prompt,
            answer: card.answer,
            options: card.options,
            explanation: card.explanation,
            deepMd: card.deepMd,
            mnemonic: card.mnemonic,
            sourceRef: card.sourceRef,
            aiGenerated: card.aiGenerated,
            suspended: card.suspended,
            position: card.position,
            questionId: card.questionId ? (questionIdMap.get(card.questionId) ?? null) : null,
          })),
        });

        // Прогресс форкающего по исходным карточкам переезжает на копии (маппинг по позиции):
        // в старом приложении чужие публичные колоды учились без копирования, и после миграции
        // этот прогресс иначе остался бы навсегда недостижимым — форк начинал бы с нуля.
        const progressRows = await tx.cardProgress.findMany({
          where: { userId, cardId: { in: source.cards.map((card) => card.id) } },
          select: {
            cardId: true,
            stability: true,
            difficulty: true,
            due: true,
            state: true,
            reps: true,
            lapses: true,
            lastReviewedAt: true,
            masteredDays: true,
            priority: true,
          },
        });
        if (progressRows.length) {
          const copies = await tx.card.findMany({ where: { examId: exam.id }, select: { id: true, position: true } });
          const copyIdByPosition = new Map(copies.map((copy) => [copy.position, copy.id]));
          const positionBySourceCardId = new Map(source.cards.map((card) => [card.id, card.position]));
          await tx.cardProgress.createMany({
            data: progressRows.flatMap((row) => {
              const { cardId, ...fsrsState } = row;
              const position = positionBySourceCardId.get(cardId);
              const copyId = position === undefined ? undefined : copyIdByPosition.get(position);
              if (!copyId) return [];
              return [{ userId, cardId: copyId, ...fsrsState }];
            }),
            skipDuplicates: true,
          });
        }

        return exam;
      },
      { timeout: 30_000 },
    );

    return { id: forked.id };
  });

// Избранное: чужой публичный экзамен сохраняется в закладки (перенос механики колод) —
// список живёт на «Сегодня», забрать себе можно в любой момент через форк на /d/$examId.
export const setExamFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string(), favorite: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, isPublic: true },
      select: { id: true, userId: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден или недоступен"));
    }
    if (exam.userId === userId) {
      setResponseStatus(400);
      throw new Error(typo("Свой экзамен не нужно добавлять в избранное — он и так у вас"));
    }
    if (data.favorite) {
      await context.db.examFavorite.upsert({
        where: { userId_examId: { userId, examId: exam.id } },
        create: { userId, examId: exam.id },
        update: {},
      });
    } else {
      await context.db.examFavorite.deleteMany({ where: { userId, examId: exam.id } });
    }
    return { favorite: data.favorite };
  });

export const getFavoriteExams = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const favorites = await context.db.examFavorite.findMany({
      // Фильтр isPublic — страховка: снятие публикации и так отзывает избранное.
      where: { userId: context.session.user.id, exam: { isPublic: true } },
      orderBy: { createdAt: "desc" },
      select: {
        exam: {
          select: {
            id: true,
            title: true,
            user: { select: { name: true } },
            _count: { select: { cards: true, questions: true } },
          },
        },
      },
    });
    return favorites.map((favorite) => ({
      examId: favorite.exam.id,
      title: favorite.exam.title,
      authorName: favorite.exam.user.name,
      totalCards: favorite.exam._count.cards,
      totalQuestions: favorite.exam._count.questions,
    }));
  });

export type ExamListItem = Awaited<ReturnType<typeof getExams>>[number];
