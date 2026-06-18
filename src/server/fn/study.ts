import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { scheduleNextReview, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Сессия повторения: очередь карточек к показу и применение оценки свайпа.

const MS_PER_MINUTE = 60_000;
const STUDY_BATCH = 60;

// Случайный порядок карточек в сессии (decorate-sort-undecorate со случайным ключом).
function shuffle<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item);
}

export const getStudyQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, userId: context.session.user.id },
      select: { id: true, title: true, requiredCorrect: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }

    // Карточки, у которых подошёл срок (dueAt ≤ сейчас). Новые карточки due сразу.
    const cards = await context.db.card.findMany({
      where: { deckId: deck.id, dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      take: STUDY_BATCH,
      select: { id: true, question: true, answer: true },
    });

    // Карточки к показу берём по сроку (самые «просроченные» вперёд), а внутри сессии тасуем.
    return { deckId: deck.id, deckTitle: deck.title, requiredCorrect: deck.requiredCorrect, cards: shuffle(cards) };
  });

export const reviewCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string(), grade: zodRussian.enum(["again", "good"]) }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, deck: { userId } },
      select: { id: true, deckId: true, box: true, ease: true, intervalDays: true, reps: true, streak: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    const next = scheduleNextReview(
      { box: card.box, ease: card.ease, intervalDays: card.intervalDays, reps: card.reps, streak: card.streak },
      data.grade,
    );
    const isGood = data.grade === "good";
    const reviewedAt = new Date();
    const dueAt = new Date(reviewedAt.getTime() + next.dueInMinutes * MS_PER_MINUTE);

    // Обновление состояния карточки и запись в журнал — атомарно: журнал и есть источник статистики.
    await context.db.$transaction([
      context.db.card.update({
        where: { id: card.id },
        data: {
          box: next.box,
          ease: next.ease,
          intervalDays: next.intervalDays,
          reps: next.reps,
          streak: next.streak,
          dueAt,
          lastReviewedAt: reviewedAt,
          correctCount: { increment: isGood ? 1 : 0 },
          wrongCount: { increment: isGood ? 0 : 1 },
        },
      }),
      context.db.review.create({
        data: { cardId: card.id, deckId: card.deckId, userId, grade: data.grade, reviewedAt },
      }),
    ]);

    return true;
  });
