import { type PrismaClient } from "@prisma/client";

import {
  buildDailyPlan,
  type DailyPlanBlock,
  mskCalendarDaysBetween,
  type PlanExamInput,
  readiness,
  retrievability,
  startOfDayMsk,
} from "~/lib";

import { completedReviewDayKeys, streakFromCompletedDays } from "./streak";
import { type EffectiveUserSettings, loadUserSettings } from "./userSettings";

// Единый расчёт «сегодняшнего дня» пользователя: план, серия, заморозки. Используется
// и планом дня, и статистикой — чтобы серия и «день засчитан» совпадали на всех экранах.

// Скорость ~2 карточки в минуту (дизайн-док, раздел 3).
const CARDS_PER_MINUTE = 2;

export interface TodayExamSummary {
  examId: string;
  title: string;
  examDate: Date | null;
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
  /** Дни МСК, засчитанные в серию по порогу ответов (без сегодняшнего «закрытого плана»). */
  completedDayKeys: Set<string>;
  todayPlanDone: boolean;
  streakDays: number;
  freezesSpent: number;
}

/** План дня, серия и заморозки одним расчётом — общая точка правды для «Сегодня» и статистики. */
export async function computeTodayState(db: PrismaClient, userId: string, now: Date): Promise<TodayState> {
  const settings = await loadUserSettings(db, userId, now);

  const exams = await db.exam.findMany({
    where: { userId, archivedAt: null },
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

  const [completedDayKeys, cardsDoneToday] = await Promise.all([
    completedReviewDayKeys(db, userId),
    db.review.count({ where: { userId, reviewedAt: { gte: startOfDayMsk(now) } } }),
  ]);

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
    const daysToExam = exam.examDate ? mskCalendarDaysBetween(now, exam.examDate) : null;

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

  const plan = buildDailyPlan({
    exams: planInputs,
    capacityCards: settings.dailyMinutesTotal * CARDS_PER_MINUTE,
  });
  const planTotal = plan.reduce((sum, block) => sum + block.cardIds.length, 0);
  const todayPlanDone = !planTotal && cardsDoneToday > 0;

  const streak = streakFromCompletedDays({
    completedDayKeys,
    restWeekdays: settings.restWeekdays,
    freezesLeft: settings.streakFreezesLeft,
    todayPlanDone,
    now,
  });

  return {
    settings,
    exams: examSummaries,
    plan,
    planTotal,
    cardsDoneToday,
    completedDayKeys,
    todayPlanDone,
    streakDays: streak.days,
    freezesSpent: streak.freezesSpent,
  };
}
