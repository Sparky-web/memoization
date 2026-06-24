import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { scheduleNextReview, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Сессия повторения: очередь карточек к показу и применение оценки свайпа.
// Прогресс у каждого пользователя свой (CardProgress) — поэтому учить можно и свою, и избранную чужую колоду.

const MS_PER_MINUTE = 60_000;

// Колода доступна пользователю, если он владелец ИЛИ добавил ещё публичную колоду в избранное.
function accessibleDeckWhere(userId: string) {
  return { OR: [{ userId }, { isPublic: true, favorites: { some: { userId } } }] };
}

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
    const userId = context.session.user.id;
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, ...accessibleDeckWhere(userId) },
      select: { id: true, title: true, requiredCorrect: true, userId: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }

    // Карточка к показу, если у пользователя по ней наступил срок (dueAt ≤ сейчас)
    // или прогресса ещё нет вовсе (новая карточка — due сразу). Лимита нет.
    const now = Date.now();
    const cards = await context.db.card.findMany({
      where: { deckId: deck.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        question: true,
        answer: true,
        answerDeep: true,
        progress: { where: { userId }, select: { dueAt: true } },
      },
    });

    const due = cards
      .filter((card) => {
        const progress = card.progress[0];
        return !progress || progress.dueAt.getTime() <= now;
      })
      .map((card) => ({ id: card.id, question: card.question, answer: card.answer, answerDeep: card.answerDeep }));

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      requiredCorrect: deck.requiredCorrect,
      // Чат по карточке (в окне «подробнее») — только владельцу: история общая на карточку.
      isOwner: deck.userId === userId,
      cards: shuffle(due),
    };
  });

export const reviewCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string(), grade: zodRussian.enum(["again", "good"]) }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, deck: accessibleDeckWhere(userId) },
      select: {
        id: true,
        deckId: true,
        progress: { where: { userId }, select: { box: true, ease: true, intervalDays: true, reps: true, streak: true } },
      },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    // Нет строки прогресса — карточка для пользователя новая, считаем от стартового состояния.
    const current = card.progress[0] ?? { box: 0, ease: 2.5, intervalDays: 0, reps: 0, streak: 0 };
    const next = scheduleNextReview(current, data.grade);
    const isGood = data.grade === "good";
    const reviewedAt = new Date();
    const dueAt = new Date(reviewedAt.getTime() + next.dueInMinutes * MS_PER_MINUTE);

    // Обновление прогресса и запись в журнал — атомарно: журнал и есть источник статистики.
    await context.db.$transaction([
      context.db.cardProgress.upsert({
        where: { userId_cardId: { userId, cardId: card.id } },
        create: {
          userId,
          cardId: card.id,
          box: next.box,
          ease: next.ease,
          intervalDays: next.intervalDays,
          reps: next.reps,
          streak: next.streak,
          dueAt,
          lastReviewedAt: reviewedAt,
          correctCount: isGood ? 1 : 0,
          wrongCount: isGood ? 0 : 1,
        },
        update: {
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

// «Начать заново»: удаляем прогресс пользователя по карточкам колоды — они снова становятся новыми и due.
// Журнал повторений (статистику) не трогаем.
export const resetDeckProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, ...accessibleDeckWhere(userId) },
      select: { id: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    const result = await context.db.cardProgress.deleteMany({ where: { userId, card: { deckId: deck.id } } });
    return { reset: result.count };
  });
