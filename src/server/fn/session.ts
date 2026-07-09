import { type PrismaClient } from "@prisma/client";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import {
  buildDailyPlan,
  makeScheduler,
  mskCalendarDaysBetween,
  normalizeAnswer,
  PAYWALL_ERRORS,
  readiness,
  retrievability,
  reviewProgress,
  type ReviewRating,
  shuffleItems,
  startOfDayMsk,
  typo,
  zodRussian,
} from "~/lib";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";

// Сессия припоминания: сервер строит очередь и проверяет ответы. Ответы и correct
// НИКОГДА не отдаются клиенту до ответа пользователя (анти-чит); open-карточка получает
// эталон только в момент показа ответа, оценка приходит отдельным submitOpenRating.

const sessionKindInput = zodRussian.enum(["daily", "pretest", "bedtime", "cram"]);

// Скорость ~2 карточки в минуту (дизайн-док, раздел 3).
const CARDS_PER_MINUTE = 2;
// Предсонный прогон — короткий: ~10 самых важных карточек дня, без новых.
const BEDTIME_CARDS = 10;

interface QueueCard {
  id: string;
  format: string;
  prompt: string;
  options: string[];
  topic: string | null;
  progress: {
    stability: number;
    difficulty: number;
    due: Date;
    state: number;
    reps: number;
    lapses: number;
    lastReviewedAt: Date | null;
    priority: boolean;
  } | null;
}

function daysToExamOf(examDate: Date | null, now: Date): number | null {
  return examDate ? Math.max(mskCalendarDaysBetween(now, examDate), 0) : null;
}

// Очередь дневной сессии: приоритет → due (по просроченности) → новые (интерливинг тем).
function dailyQueue(cards: QueueCard[], daysToExam: number | null, examId: string, capacity: number): string[] {
  const priority = cards
    .filter((card) => card.progress?.priority)
    .sort((left, right) => (left.progress?.due.getTime() ?? 0) - (right.progress?.due.getTime() ?? 0));
  const now = new Date();
  const due = cards
    .filter((card) => card.progress && !card.progress.priority && card.progress.due <= now)
    .sort((left, right) => (left.progress?.due.getTime() ?? 0) - (right.progress?.due.getTime() ?? 0));
  const fresh = cards.filter((card) => !card.progress);

  const plan = buildDailyPlan({
    exams: [
      {
        examId,
        daysToExam,
        readiness: readiness(
          cards.map((card) => ({ retrievability: card.progress ? retrievability(card.progress, now) : 0 })),
        ),
        priorityCardIds: priority.map((card) => card.id),
        dueCardIds: due.map((card) => card.id),
        newCardIds: fresh.map((card) => ({ id: card.id, topic: card.topic })),
      },
    ],
    capacityCards: capacity,
  });
  return plan[0]?.cardIds ?? [];
}

// Cram: FSRS-интервалы игнорируются — приоритетные, затем самые слабые (retrievability asc).
function cramQueue(cards: QueueCard[], capacity: number): string[] {
  const now = new Date();
  const priority = cards.filter((card) => card.progress?.priority);
  const rest = cards
    .filter((card) => !card.progress?.priority)
    .map((card) => ({ card, weak: card.progress ? retrievability(card.progress, now) : 0 }))
    .sort((left, right) => left.weak - right.weak)
    .map((entry) => entry.card);
  return [...priority, ...rest].slice(0, capacity).map((card) => card.id);
}

export const startSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string(), kind: sessionKindInput }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId, archivedAt: null },
      select: { id: true, title: true, examDate: true, dailyMinutes: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    if (data.kind === "cram" && !(await hasActivePro(context.db, userId))) {
      setResponseStatus(402);
      throw new Error(PAYWALL_ERRORS.CRAM);
    }

    const rows = await context.db.card.findMany({
      where: { examId: exam.id, suspended: false },
      orderBy: { position: "asc" },
      select: {
        id: true,
        format: true,
        prompt: true,
        options: true,
        question: { select: { topic: true } },
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
            priority: true,
          },
        },
      },
    });
    const cards: QueueCard[] = rows.map((row) => ({
      id: row.id,
      format: row.format,
      prompt: row.prompt,
      options: row.options,
      topic: row.question?.topic ?? null,
      progress: row.progress[0] ?? null,
    }));

    const now = new Date();
    const capacity = Math.max(exam.dailyMinutes * CARDS_PER_MINUTE, 1);
    const daysToExam = daysToExamOf(exam.examDate, now);

    let queueIds: string[] = [];
    if (data.kind === "daily") {
      queueIds = dailyQueue(cards, daysToExam, exam.id, capacity);
    }
    if (data.kind === "pretest") {
      // «Сначала бой»: только новые карточки, до изучения; ошибки нормальны — UI объяснит.
      queueIds = cards
        .filter((card) => !card.progress)
        .slice(0, capacity)
        .map((card) => card.id);
    }
    if (data.kind === "bedtime") {
      // Лёгкий прогон уже виденных сегодня карточек, слабые — первыми; новых не даём.
      const reviewedToday = await context.db.review.findMany({
        where: { userId, examId: exam.id, reviewedAt: { gte: startOfDayMsk(now) } },
        select: { cardId: true },
      });
      const todayIds = new Set(reviewedToday.map((review) => review.cardId));
      queueIds = cards
        .filter((card) => card.progress && todayIds.has(card.id))
        .map((card) => ({ card, weak: card.progress ? retrievability(card.progress, now) : 0 }))
        .sort((left, right) => left.weak - right.weak)
        .slice(0, BEDTIME_CARDS)
        .map((entry) => entry.card.id);
    }
    if (data.kind === "cram") {
      queueIds = cramQueue(cards, capacity);
    }

    const cardById = new Map(cards.map((card) => [card.id, card]));
    return {
      examId: exam.id,
      examTitle: exam.title,
      kind: data.kind,
      cards: queueIds.flatMap((cardId) => {
        const card = cardById.get(cardId);
        if (!card) return [];
        return [
          {
            id: card.id,
            format: card.format,
            prompt: card.prompt,
            topic: card.topic,
            // Варианты выбора перемешаны; правильный проверяется на сервере по тексту.
            options: card.format === "mcq" || card.format === "cloze" ? shuffleItems([...new Set(card.options)]) : [],
          },
        ];
      }),
    };
  });

// Приоритет «уверенный промах»: ставится при confidence ≥ 70 и ошибке, сбрасывается верным ответом.
function nextPriority(correct: boolean, confidence: number | null, current: boolean): boolean {
  if (correct) return false;
  if ((confidence ?? 0) >= 70) return true;
  return current;
}

interface AnswerRecord {
  userId: string;
  cardId: string;
  examId: string;
  examDate: Date | null;
  kind: "daily" | "pretest" | "bedtime" | "cram";
  rating: ReviewRating;
  correct: boolean;
  confidence: number | null;
  answerText: string | null;
  durationMs: number | null;
}

// Транзакция ответа: Review + FSRS-апдейт CardProgress + masteredDays + priority.
async function recordAnswer(db: PrismaClient, record: AnswerRecord): Promise<void> {
  const now = new Date();
  const scheduler = makeScheduler(daysToExamOf(record.examDate, now));

  await db.$transaction(async (tx) => {
    const existing = await tx.cardProgress.findUnique({
      where: { userId_cardId: { userId: record.userId, cardId: record.cardId } },
    });
    const patch = reviewProgress(
      scheduler,
      existing ?? { stability: 0, difficulty: 0, due: now, state: 0, reps: 0, lapses: 0, lastReviewedAt: null },
      record.rating,
      now,
    );

    // Successive relearning: masteredDays растёт максимум раз в календарный день МСК.
    const correctTodayCount = record.correct
      ? await tx.review.count({
          where: { userId: record.userId, cardId: record.cardId, correct: true, reviewedAt: { gte: startOfDayMsk(now) } },
        })
      : 1;
    const masteredIncrement = record.correct && !correctTodayCount ? 1 : 0;
    const priority = nextPriority(record.correct, record.confidence, existing?.priority ?? false);

    await tx.cardProgress.upsert({
      where: { userId_cardId: { userId: record.userId, cardId: record.cardId } },
      create: {
        userId: record.userId,
        cardId: record.cardId,
        ...patch,
        lastReviewedAt: now,
        masteredDays: masteredIncrement,
        priority,
      },
      update: {
        ...patch,
        lastReviewedAt: now,
        masteredDays: { increment: masteredIncrement },
        priority,
      },
    });
    await tx.review.create({
      data: {
        userId: record.userId,
        cardId: record.cardId,
        examId: record.examId,
        rating: record.rating,
        correct: record.correct,
        confidence: record.confidence,
        answerText: record.answerText,
        mode: record.kind,
        durationMs: record.durationMs,
        reviewedAt: now,
      },
    });
  });
}

function ratingForClosedAnswer(correct: boolean, confidence: number | null): ReviewRating {
  if (!correct) return 1;
  if ((confidence ?? 0) >= 90) return 4;
  return 3;
}

const answerCardInput = zodRussian.object({
  cardId: zodRussian.string(),
  kind: sessionKindInput,
  confidence: zodRussian.number().int().min(0).max(100).nullable().optional(),
  answerText: zodRussian.string().max(8000).optional(),
  selectedOption: zodRussian.string().max(600).optional(),
  boolAnswer: zodRussian.boolean().optional(),
  durationMs: zodRussian.number().int().min(0).max(3_600_000).optional(),
});

// Проверка закрытого ответа; open требует данных — ошибку отдаём до записи чего-либо.
function checkClosedAnswer(
  card: { format: string; answer: string },
  input: { answerText?: string; selectedOption?: string; boolAnswer?: boolean },
): boolean {
  if (card.format === "mcq") {
    if (input.selectedOption === undefined) {
      setResponseStatus(400);
      throw new Error(typo("Выберите вариант ответа"));
    }
    return input.selectedOption === card.answer;
  }
  if (card.format === "cloze") {
    const given = input.selectedOption ?? input.answerText;
    if (given === undefined) {
      setResponseStatus(400);
      throw new Error(typo("Введите или выберите пропущенное слово"));
    }
    return normalizeAnswer(given) === normalizeAnswer(card.answer);
  }
  if (input.boolAnswer === undefined) {
    setResponseStatus(400);
    throw new Error(typo("Выберите «верно» или «неверно»"));
  }
  return input.boolAnswer === (card.answer === "true");
}

export const answerCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(answerCardInput)
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, exam: { userId } },
      select: {
        id: true,
        format: true,
        answer: true,
        explanation: true,
        deepMd: true,
        sourceRef: true,
        examId: true,
        exam: { select: { examDate: true } },
      },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    // Открытая карточка: отдаём эталон для самооценки, Review/FSRS запишет submitOpenRating.
    if (card.format === "open") {
      return {
        type: "reveal",
        correct: null,
        rating: null,
        answer: card.answer,
        explanation: card.explanation,
        deepMd: card.deepMd,
        sourceRef: card.sourceRef,
      };
    }

    const correct = checkClosedAnswer(card, data);
    const rating = ratingForClosedAnswer(correct, data.confidence ?? null);
    await recordAnswer(context.db, {
      userId,
      cardId: card.id,
      examId: card.examId,
      examDate: card.exam.examDate,
      kind: data.kind,
      rating,
      correct,
      confidence: data.confidence ?? null,
      answerText: data.answerText ?? data.selectedOption ?? null,
      durationMs: data.durationMs ?? null,
    });

    return {
      type: "graded",
      correct,
      rating,
      answer: card.answer,
      explanation: card.explanation,
      deepMd: card.deepMd,
      sourceRef: card.sourceRef,
    };
  });

// Самооценка открытого ответа: Again/Hard/Good/Easy → 1..4; correct = не Again.
export const submitOpenRating = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      cardId: zodRussian.string(),
      kind: sessionKindInput,
      rating: zodRussian.number().int().min(1).max(4),
      confidence: zodRussian.number().int().min(0).max(100).nullable().optional(),
      answerText: zodRussian.string().max(8000).optional(),
      durationMs: zodRussian.number().int().min(0).max(3_600_000).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, exam: { userId }, format: "open" },
      select: { id: true, examId: true, exam: { select: { examDate: true } } },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    const toReviewRating = (value: number): ReviewRating => {
      if (value === 1 || value === 2 || value === 3 || value === 4) return value;
      return 3;
    };
    const rating = toReviewRating(data.rating);
    const correct = rating > 1;
    await recordAnswer(context.db, {
      userId,
      cardId: card.id,
      examId: card.examId,
      examDate: card.exam.examDate,
      kind: data.kind,
      rating,
      correct,
      confidence: data.confidence ?? null,
      answerText: data.answerText ?? null,
      durationMs: data.durationMs ?? null,
    });
    return { correct, rating };
  });

export type SessionQueue = Awaited<ReturnType<typeof startSession>>;
export type SessionCard = SessionQueue["cards"][number];
export type AnswerResult = Awaited<ReturnType<typeof answerCard>>;
