import { type PrismaClient } from "@prisma/client";

import {
  buildDailyPlan,
  computeStreak,
  type DailyPlanBlock,
  mskCalendarDaysBetween,
  mskDayKey,
  type PlanExamInput,
  readiness,
  retrievability,
  startOfDayMsk,
} from "~/lib";

import {
  completedReviewDayKeys,
  freezesLeftOf,
  recordStreakDayDone,
  spendFreezesOnRecentGap,
  streakJournal,
} from "./streak";
import { type EffectiveUserSettings, loadUserSettings } from "./userSettings";

// Единый расчёт «сегодняшнего дня» пользователя: план, серия, заморозки. Используется
// и планом дня, и статистикой — чтобы серия и «день засчитан» совпадали на всех экранах.

// Скорость ~2 карточки в минуту (дизайн-док, раздел 3).
const CARDS_PER_MINUTE = 2;

export interface TodayExamSummary {
  examId: string;
  title: string;
  examDate: Date | null;
  /** Календарных дней до экзамена; null — без даты ИЛИ экзамен уже прошёл (режим поддержки). */
  daysToExam: number | null;
  mode: string;
  status: string;
  readiness: number;
  dueCount: number;
  newCount: number;
  priorityCount: number;
}

export interface TodayState {
  settings: EffectiveUserSettings;
  exams: TodayExamSummary[];
  plan: DailyPlanBlock[];
  planTotal: number;
  cardsDoneToday: number;
  /** Дни МСК, засчитанные в серию: порог ответов + журнал StreakDay (включая сегодня). */
  completedDayKeys: Set<string>;
  /** Дни МСК, закрытые заморозкой (журнал StreakDay). */
  frozenDayKeys: Set<string>;
  todayPlanDone: boolean;
  streakDays: number;
  /** Остаток заморозок на скользящие 30 дней. */
  freezesLeft: number;
}

/** План дня, серия и заморозки одним расчётом — общая точка правды для «Сегодня» и статистики. */
export async function computeTodayState(db: PrismaClient, userId: string, now: Date): Promise<TodayState> {
  const settings = await loadUserSettings(db, userId);

  // Пауза исключает экзамен из плана дня и всех предложений (bedtime/cram/канун) —
  // строится всё отсюда, поэтому фильтра в одном месте достаточно.
  const exams = await db.exam.findMany({
    where: { userId, archivedAt: null, pausedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, examDate: true, mode: true, status: true },
  });

  // Карточки всех активных экзаменов с прогрессом — очереди строятся в памяти (без N+1).
  const cards = await db.card.findMany({
    where: { examId: { in: exams.map((exam) => exam.id) }, suspended: false },
    orderBy: { position: "asc" },
    select: {
      id: true,
      examId: true,
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

  const [thresholdDayKeys, journal, cardsDoneToday] = await Promise.all([
    completedReviewDayKeys(db, userId),
    streakJournal(db, userId),
    db.review.count({ where: { userId, reviewedAt: { gte: startOfDayMsk(now) } } }),
  ]);
  const completedDayKeys = new Set([...thresholdDayKeys, ...journal.doneDayKeys]);

  const planInputs: PlanExamInput[] = [];
  const examSummaries: TodayExamSummary[] = [];

  for (const exam of exams) {
    const examCards = cards.filter((card) => card.examId === exam.id);
    const priority = examCards
      .filter((card) => card.progress[0]?.priority)
      .sort((left, right) => (left.progress[0]?.due.getTime() ?? 0) - (right.progress[0]?.due.getTime() ?? 0));
    const due = examCards
      .filter((card) => {
        const progress = card.progress[0];
        return progress && !progress.priority && progress.due <= now;
      })
      .sort((left, right) => (left.progress[0]?.due.getTime() ?? 0) - (right.progress[0]?.due.getTime() ?? 0));
    const fresh = examCards.filter((card) => !card.progress.length);
    const examReadiness = readiness(
      examCards.map((card) => {
        const progress = card.progress[0];
        return { retrievability: progress ? retrievability(progress, now) : 0 };
      }),
    );
    // Прошедший экзамен не должен доминировать в плане с максимальной срочностью: до решения
    // пользователя (архив / «сохранить надолго») он живёт в режиме поддержки (daysToExam = null).
    const rawDaysToExam = exam.examDate ? mskCalendarDaysBetween(now, exam.examDate) : null;
    const daysToExam = rawDaysToExam !== null && rawDaysToExam < 0 ? null : rawDaysToExam;

    planInputs.push({
      examId: exam.id,
      daysToExam,
      readiness: examReadiness,
      priorityCardIds: priority.map((card) => card.id),
      dueCardIds: due.map((card) => card.id),
      newCardIds: fresh.map((card) => ({ id: card.id, topic: card.question?.topic ?? null })),
    });
    examSummaries.push({
      examId: exam.id,
      title: exam.title,
      examDate: exam.examDate,
      daysToExam,
      mode: exam.mode,
      status: exam.status,
      readiness: examReadiness,
      dueCount: due.length + priority.length,
      newCount: fresh.length,
      priorityCount: priority.length,
    });
  }

  // Дневной бюджет — общий и конечный: сделанные сегодня ответы уменьшают остаток плана,
  // иначе план бесконечно доливался бы новыми карточками, «сделано X из Y» ползло бы,
  // а «День засчитан» не наступал бы, пока в экзамене вообще есть карточки.
  const plan = buildDailyPlan({
    exams: planInputs,
    capacityCards: Math.max(settings.dailyMinutesTotal * CARDS_PER_MINUTE - cardsDoneToday, 0),
  });
  const planTotal = plan.reduce((sum, block) => sum + block.cardIds.length, 0);
  const todayPlanDone = !planTotal && cardsDoneToday > 0;

  // Закрытый план фиксируется durable: назавтра день с < 10 ответами останется засчитанным.
  const todayKey = mskDayKey(now);
  if (todayPlanDone && !completedDayKeys.has(todayKey)) {
    await recordStreakDayDone(db, userId, todayKey);
  }
  if (todayPlanDone) completedDayKeys.add(todayKey);

  // Автосписание заморозок за свежие пропуски — до подсчёта серии, чтобы она их уже видела.
  await spendFreezesOnRecentGap(db, userId, {
    completedDayKeys,
    frozenDayKeys: journal.frozenDayKeys,
    restWeekdays: settings.restWeekdays,
    now,
  });

  const streakDays = computeStreak({
    now,
    completedDayKeys,
    frozenDayKeys: journal.frozenDayKeys,
    restWeekdays: settings.restWeekdays,
  });

  return {
    settings,
    exams: examSummaries,
    plan,
    planTotal,
    cardsDoneToday,
    completedDayKeys,
    frozenDayKeys: journal.frozenDayKeys,
    todayPlanDone,
    streakDays,
    freezesLeft: freezesLeftOf(journal.frozenDayKeys, now),
  };
}
