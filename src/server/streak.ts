import { type PrismaClient } from "@prisma/client";

import { computeStreak, mskDayKey } from "~/lib";

// Серия дней. «День засчитан» = закрыт дневной план (cardsDone ≥ min(план, 10)) ЛИБО ≥ 10 ответов.
// Для прошлых дней историю плана не храним, поэтому порог фиксированный (≥ 10 ответов) — считается
// одним SQL-запросом; сегодняшний день дополнительно засчитывается закрытым планом (< 10 карточек).

const STREAK_DAY_THRESHOLD = 10;

/** Счётчики ответов по календарным дням МСК (ключ YYYY-MM-DD) — для календаря активности. */
export async function reviewCountsByMskDay(db: PrismaClient, userId: string): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char("reviewedAt" + interval '3 hours', 'YYYY-MM-DD') AS day, count(*)::int AS n
    FROM "Review"
    WHERE "userId" = ${userId}
    GROUP BY 1
  `;
  return new Map(rows.map((row) => [row.day, row.n]));
}

/** Дни МСК, засчитанные по порогу ответов (SQL с HAVING — без переноса журналов в память). */
export async function completedReviewDayKeys(db: PrismaClient, userId: string): Promise<Set<string>> {
  const rows = await db.$queryRaw<{ day: string }[]>`
    SELECT to_char("reviewedAt" + interval '3 hours', 'YYYY-MM-DD') AS day
    FROM "Review"
    WHERE "userId" = ${userId}
    GROUP BY 1
    HAVING count(*) >= ${STREAK_DAY_THRESHOLD}
  `;
  return new Set(rows.map((row) => row.day));
}

/** Серия по засчитанным дням с учётом дней отдыха и заморозок (заморозки виртуальные — по логике В1). */
export function streakFromCompletedDays(input: {
  completedDayKeys: ReadonlySet<string>;
  restWeekdays: readonly number[];
  freezesLeft: number;
  /** План на сегодня закрыт (осталось 0 карточек при ≥ 1 ответе) — день засчитан и при < 10 ответах. */
  todayPlanDone: boolean;
  now: Date;
}): { days: number; freezesSpent: number } {
  const completedDayKeys = new Set(input.completedDayKeys);
  if (input.todayPlanDone) completedDayKeys.add(mskDayKey(input.now));
  return computeStreak({
    now: input.now,
    completedDayKeys,
    restWeekdays: input.restWeekdays,
    freezesLeft: input.freezesLeft,
  });
}
