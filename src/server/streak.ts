import { type PrismaClient } from "@prisma/client";

import { MAX_STREAK_LOOKBACK_DAYS, mskDayKey, mskWeekday } from "~/lib";

// Серия дней. «День засчитан» = закрыт дневной план (cardsDone ≥ min(план, 10)) ЛИБО ≥ 10 ответов.
// Порог считается одним SQL-запросом по журналу Review; закрытие плана меньше чем на 10 карточек
// фиксируется durable в журнале StreakDay (kind="done") — иначе назавтра такой день забывался бы.
// Там же durable живут заморозки (kind="freeze"): пропуск, закрытый заморозкой, списывается один раз.

const STREAK_DAY_THRESHOLD = 10;
/** Заморозок доступно на скользящие 30 дней МСК (обещание UI «2 в месяц»). */
const FREEZES_PER_MONTH = 2;
const FREEZE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Журнал StreakDay: дни закрытого плана (kind="done") и дни, закрытые заморозкой (kind="freeze"). */
export async function streakJournal(
  db: PrismaClient,
  userId: string,
): Promise<{ doneDayKeys: Set<string>; frozenDayKeys: Set<string> }> {
  const rows = await db.streakDay.findMany({ where: { userId }, select: { dayKey: true, kind: true } });
  const doneDayKeys = new Set<string>();
  const frozenDayKeys = new Set<string>();
  for (const row of rows) {
    if (row.kind === "freeze") {
      frozenDayKeys.add(row.dayKey);
    } else {
      doneDayKeys.add(row.dayKey);
    }
  }
  return { doneDayKeys, frozenDayKeys };
}

/**
 * Фиксирует «план дня закрыт» в журнале: день с закрытым планом меньше чем на 10 карточек
 * должен остаться засчитанным и завтра. Upsert — повторные вызовы за день безвредны.
 */
export async function recordStreakDayDone(db: PrismaClient, userId: string, dayKey: string): Promise<void> {
  await db.streakDay.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    create: { userId, dayKey, kind: "done" },
    update: {},
  });
}

/** Остаток заморозок: FREEZES_PER_MONTH минус потраченные за скользящие 30 дней МСК. */
export function freezesLeftOf(frozenDayKeys: ReadonlySet<string>, now: Date): number {
  let spent = 0;
  for (let offset = 0; offset < FREEZE_WINDOW_DAYS; offset += 1) {
    if (frozenDayKeys.has(mskDayKey(new Date(now.getTime() - offset * DAY_MS)))) spent += 1;
  }
  return Math.max(FREEZES_PER_MONTH - spent, 0);
}

/**
 * Автосписание заморозок: пропуски между сегодня и последним выполненным днём закрываются
 * заморозками, если их хватает на весь разрыв (иначе серия честно рвётся и заморозки не жгутся).
 * Списание durable — день попадает в StreakDay, повторные расчёты его не тратят заново,
 * а окно 30 дней возвращает потраченное со временем. Мутирует frozenDayKeys, чтобы
 * вызывающий расчёт серии сразу видел закрытые дни.
 */
export async function spendFreezesOnRecentGap(
  db: PrismaClient,
  userId: string,
  input: {
    completedDayKeys: ReadonlySet<string>;
    frozenDayKeys: Set<string>;
    restWeekdays: readonly number[];
    now: Date;
  },
): Promise<void> {
  const restWeekdays = new Set(input.restWeekdays);
  const gapDayKeys: string[] = [];
  let insideStreak = false;
  for (let offset = 1; offset < MAX_STREAK_LOOKBACK_DAYS; offset += 1) {
    const moment = new Date(input.now.getTime() - offset * DAY_MS);
    const dayKey = mskDayKey(moment);
    if (input.completedDayKeys.has(dayKey)) {
      // Заморозка тратится, только если за пропуском (глубже в прошлом) есть выполненный
      // день: хвост пропусков без серии за ним заморозки жечь не должен.
      insideStreak = true;
      break;
    }
    if (input.frozenDayKeys.has(dayKey)) continue;
    if (restWeekdays.has(mskWeekday(moment))) continue;
    gapDayKeys.push(dayKey);
    // Разрыв длиннее месячного запаса заморозок не закрыть — серия уже порвана.
    if (gapDayKeys.length > FREEZES_PER_MONTH) return;
  }
  if (!insideStreak || !gapDayKeys.length) return;
  if (gapDayKeys.length > freezesLeftOf(input.frozenDayKeys, input.now)) return;

  await db.streakDay.createMany({
    data: gapDayKeys.map((dayKey) => ({ userId, dayKey, kind: "freeze" })),
    skipDuplicates: true,
  });
  for (const dayKey of gapDayKeys) input.frozenDayKeys.add(dayKey);
}
