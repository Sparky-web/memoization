import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Статистика подготовки: сводка по всем колодам и детально по одной.
// Прогресс повторения берётся из CardProgress текущего пользователя (своя и избранная колода — со своим прогрессом).

const ACTIVITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Колода доступна пользователю, если он владелец ИЛИ добавил ещё публичную колоду в избранное.
function accessibleDeckWhere(userId: string) {
  return { OR: [{ userId }, { isPublic: true, favorites: { some: { userId } } }] };
}

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

// Конец календарного дня в таймзоне приложения. Europe/Moscow — фиксированный UTC+3
// (перехода на летнее время нет с 2014 года), поэтому смещение можно зашить в строку.
const MOSCOW_UTC_OFFSET = "+03:00";

function endOfMoscowDay(daysFromNow: number): Date {
  return new Date(`${dayKey(new Date(Date.now() + daysFromNow * DAY_MS))}T23:59:59.999${MOSCOW_UTC_OFFSET}`);
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
    const endToday = endOfMoscowDay(0);
    const endTomorrow = endOfMoscowDay(1);
    // «Неделя» = сегодня и ещё 6 дней вперёд.
    const endWeek = endOfMoscowDay(6);

    const [totalDecks, totalCards, masteredRows, dueRows, gradeGroups, recentReviews, reviewDays, upcomingDue] =
      await Promise.all([
        context.db.deck.count({ where: { userId } }),
        context.db.card.count({ where: { deck: { userId } } }),
        // «Усвоено» = карточки владельца, у которых его серия верных ответов ≥ требуемого числа повторений колоды.
        context.db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM "CardProgress" cp
        JOIN "Card" c ON c.id = cp."cardId"
        JOIN "Deck" d ON d.id = c."deckId"
        WHERE d."userId" = ${userId} AND cp."userId" = ${userId} AND cp.streak >= d."requiredCorrect"
      `,
        // «К повторению» = карточки без прогресса (новые) или с наступившим сроком.
        context.db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM "Card" c
        JOIN "Deck" d ON d.id = c."deckId"
        LEFT JOIN "CardProgress" cp ON cp."cardId" = c.id AND cp."userId" = ${userId}
        WHERE d."userId" = ${userId} AND (cp.id IS NULL OR cp."dueAt" <= ${now})
      `,
        context.db.review.groupBy({ by: ["grade"], where: { userId }, _count: { _all: true } }),
        context.db.review.findMany({ where: { userId, reviewedAt: { gte: since } }, select: { reviewedAt: true } }),
        context.db.review.findMany({
          where: { userId },
          select: { reviewedAt: true },
          orderBy: { reviewedAt: "desc" },
          take: 1000,
        }),
        // Прогноз нагрузки: все сроки повторения пользователя в ближайшую неделю (включая просроченные).
        context.db.cardProgress.findMany({ where: { userId, dueAt: { lte: endWeek } }, select: { dueAt: true } }),
      ]);

    const masteredCards = masteredRows[0]?.n ?? 0;
    const dueCards = dueRows[0]?.n ?? 0;
    const goodCount = gradeGroups.find((group) => group.grade === "good")?._count._all ?? 0;
    const totalReviews = gradeGroups.reduce((sum, group) => sum + group._count._all, 0);
    const accuracy = totalReviews > 0 ? goodCount / totalReviews : 0;
    const activity = buildActivitySeries(recentReviews);
    const reviewsToday = activity[activity.length - 1]?.count ?? 0;
    const streakDays = computeStreak(new Set(reviewDays.map((review) => dayKey(review.reviewedAt))));

    // Прогноз: сколько карточек станет к повторению до конца сегодня / завтра / за неделю (накопительно).
    const forecast = {
      today: upcomingDue.filter((progress) => progress.dueAt <= endToday).length,
      tomorrow: upcomingDue.filter((progress) => progress.dueAt > endToday && progress.dueAt <= endTomorrow).length,
      week: upcomingDue.length,
    };

    return {
      totalDecks,
      totalCards,
      masteredCards,
      dueCards,
      totalReviews,
      accuracy,
      reviewsToday,
      streakDays,
      activity,
      forecast,
    };
  });

export const getDeckStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, ...accessibleDeckWhere(userId) },
      select: { id: true, requiredCorrect: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    const now = Date.now();
    const since = new Date(now - ACTIVITY_DAYS * DAY_MS);

    const [totalCards, progressRows, gradeGroups, recentReviews, fillCount, quizCount] = await Promise.all([
      context.db.card.count({ where: { deckId: deck.id } }),
      // Прогресс пользователя по карточкам этой колоды — из него считаем новые/изучаемые/усвоенные/к повторению.
      context.db.cardProgress.findMany({
        where: { userId, card: { deckId: deck.id } },
        select: { streak: true, dueAt: true },
      }),
      context.db.review.groupBy({ by: ["grade"], where: { deckId: deck.id, userId }, _count: { _all: true } }),
      context.db.review.findMany({
        where: { deckId: deck.id, userId, reviewedAt: { gte: since } },
        select: { reviewedAt: true },
      }),
      context.db.fillTask.count({ where: { deckId: deck.id, hidden: false } }),
      context.db.quizTask.count({ where: { deckId: deck.id, hidden: false } }),
    ]);

    // Карточки без строки прогресса — новые (и сразу к повторению).
    const newCards = Math.max(totalCards - progressRows.length, 0);
    const masteredCards = progressRows.filter((progress) => progress.streak >= deck.requiredCorrect).length;
    const dueFromProgress = progressRows.filter((progress) => progress.dueAt.getTime() <= now).length;
    const dueCards = newCards + dueFromProgress;
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
      fillCount,
      quizCount,
      activity: buildActivitySeries(recentReviews),
    };
  });

export type OverallStats = Awaited<ReturnType<typeof getOverallStats>>;
export type DeckStats = Awaited<ReturnType<typeof getDeckStats>>;
export type ActivityPoint = OverallStats["activity"][number];
