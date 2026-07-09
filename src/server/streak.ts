import { type PrismaClient } from "@prisma/client";

import { computeStreak, mskDayKey } from "~/lib";

// Серия дней: день засчитан при cardsDone ≥ 10 (порог min(план, 10) для прошлых дней
// невосстановим — историю плана не храним; уточнение — волна 4). Сегодняшний день
// дополнительно засчитывается, если план на сегодня полностью закрыт.

const STREAK_DAY_THRESHOLD = 10;

/** Счётчики ответов по календарным дням МСК (ключ YYYY-MM-DD). */
export async function reviewCountsByMskDay(db: PrismaClient, userId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char("reviewedAt" + interval '3 hours', 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM "Review"
    WHERE "userId" = ${userId}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.day, row.n]));
}

/** Серия по журналу ответов с учётом дней отдыха и заморозок (заморозки виртуальные — списание в волне 4). */
export function streakFromReviewDays(input: {
  countsByDay: Map<string, number>;
  restWeekdays: readonly number[];
  freezesLeft: number;
  /** План на сегодня закрыт (осталось 0 карточек) — сегодняшний день засчитывается и при < 10 ответах. */
  todayPlanDone: boolean;
  now: Date;
}): { days: number; freezesSpent: number } {
  const todayKey = mskDayKey(input.now);
  const completedDayKeys = new Set<string>();
  for (const [day, count] of input.countsByDay) {
    if (count >= STREAK_DAY_THRESHOLD) completedDayKeys.add(day);
    if (day === todayKey && count > 0 && input.todayPlanDone) completedDayKeys.add(day);
  }
  return computeStreak({
    now: input.now,
    completedDayKeys,
    restWeekdays: input.restWeekdays,
    freezesLeft: input.freezesLeft,
  });
}
