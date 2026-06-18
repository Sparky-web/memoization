import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Статистика подготовки: сводка по всем колодам и детально по одной.

const ACTIVITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERED_INTERVAL_DAYS = 21;

// Ключ дня в таймзоне приложения (МСК): активность и серия считаются по местным календарным дням,
// а не по UTC — иначе вечерние повторения утекали бы в следующий день.
const APP_TIME_ZONE = "Europe/Moscow";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE });

function dayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

// Активность за последние ACTIVITY_DAYS дней, включая дни без повторений (нули).
function buildActivitySeries(reviews: { reviewedAt: Date }[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    const key = dayKey(review.reviewedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const series: { date: string; count: number }[] = [];
  const now = Date.now();
  for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset--) {
    const key = dayKey(new Date(now - offset * DAY_MS));
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

// Серия подряд идущих дней с повторениями. Жива, если занимались сегодня или (ещё) вчера.
function computeStreak(dayKeys: Set<string>): number {
  const now = Date.now();
  const studiedToday = dayKeys.has(dayKey(new Date(now)));
  if (!studiedToday && !dayKeys.has(dayKey(new Date(now - DAY_MS)))) return 0;

  let streak = 0;
  let offset = studiedToday ? 0 : 1;
  for (;;) {
    if (!dayKeys.has(dayKey(new Date(now - offset * DAY_MS)))) break;
    streak += 1;
    offset += 1;
  }
  return streak;
}

export const getOverallStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const now = new Date();
    const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);

    const [totalDecks, totalCards, masteredCards, dueCards, gradeGroups, recentReviews, reviewDays] = await Promise.all([
      context.db.deck.count({ where: { userId } }),
      context.db.card.count({ where: { deck: { userId } } }),
      context.db.card.count({ where: { deck: { userId }, reps: { gt: 0 }, intervalDays: { gte: MASTERED_INTERVAL_DAYS } } }),
      context.db.card.count({ where: { deck: { userId }, dueAt: { lte: now } } }),
      context.db.review.groupBy({ by: ["grade"], where: { userId }, _count: { _all: true } }),
      context.db.review.findMany({ where: { userId, reviewedAt: { gte: since } }, select: { reviewedAt: true } }),
      context.db.review.findMany({ where: { userId }, select: { reviewedAt: true }, orderBy: { reviewedAt: "desc" }, take: 1000 }),
    ]);

    const goodCount = gradeGroups.find((group) => group.grade === "good")?._count._all ?? 0;
    const totalReviews = gradeGroups.reduce((sum, group) => sum + group._count._all, 0);
    const accuracy = totalReviews > 0 ? goodCount / totalReviews : 0;
    const activity = buildActivitySeries(recentReviews);
    const reviewsToday = activity[activity.length - 1]?.count ?? 0;
    const streakDays = computeStreak(new Set(reviewDays.map((review) => dayKey(review.reviewedAt))));

    return { totalDecks, totalCards, masteredCards, dueCards, totalReviews, accuracy, reviewsToday, streakDays, activity };
  });

export const getDeckStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, userId: context.session.user.id },
      select: { id: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    const now = new Date();
    const since = new Date(now.getTime() - ACTIVITY_DAYS * DAY_MS);

    const [totalCards, newCards, masteredCards, dueCards, gradeGroups, recentReviews] = await Promise.all([
      context.db.card.count({ where: { deckId: deck.id } }),
      context.db.card.count({ where: { deckId: deck.id, reps: 0 } }),
      context.db.card.count({ where: { deckId: deck.id, reps: { gt: 0 }, intervalDays: { gte: MASTERED_INTERVAL_DAYS } } }),
      context.db.card.count({ where: { deckId: deck.id, dueAt: { lte: now } } }),
      context.db.review.groupBy({ by: ["grade"], where: { deckId: deck.id }, _count: { _all: true } }),
      context.db.review.findMany({ where: { deckId: deck.id, reviewedAt: { gte: since } }, select: { reviewedAt: true } }),
    ]);

    const learningCards = Math.max(totalCards - newCards - masteredCards, 0);
    const goodCount = gradeGroups.find((group) => group.grade === "good")?._count._all ?? 0;
    const totalReviews = gradeGroups.reduce((sum, group) => sum + group._count._all, 0);
    const accuracy = totalReviews > 0 ? goodCount / totalReviews : 0;

    return {
      totalCards,
      newCards,
      learningCards,
      masteredCards,
      dueCards,
      totalReviews,
      accuracy,
      activity: buildActivitySeries(recentReviews),
    };
  });

export type OverallStats = Awaited<ReturnType<typeof getOverallStats>>;
export type DeckStats = Awaited<ReturnType<typeof getDeckStats>>;
export type ActivityPoint = OverallStats["activity"][number];
