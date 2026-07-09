import { createServerFn } from "@tanstack/react-start";

import {
  buildDailyPlan,
  mskCalendarDaysBetween,
  mskDayKey,
  type PlanExamInput,
  readiness,
  retrievability,
} from "~/lib";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";
import { reviewCountsByMskDay, streakFromReviewDays } from "~/server/streak";
import { loadUserSettings } from "~/server/userSettings";

// План дня по всем активным экзаменам + серия/заморозки + предложения bedtime/cram.
// Вся математика распределения — в чистом buildDailyPlan (src/lib/src/planner.ts).

// Скорость ~2 карточки в минуту — та же константа, что в сессии.
const CARDS_PER_MINUTE = 2;
// Предсонное повторение предлагаем с вечера (по МСК).
const BEDTIME_SUGGEST_HOUR = 21;
// Умную зубрёжку предлагаем при ≤ 2 днях до экзамена.
const CRAM_SUGGEST_DAYS = 2;

function mskHourOf(now: Date): number {
  return (now.getUTCHours() + 3) % 24;
}

export const getTodayPlan = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const now = new Date();
    const settings = await loadUserSettings(context.db, userId, now);

    const exams = await context.db.exam.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, examDate: true, mode: true, status: true },
    });

    // Карточки всех активных экзаменов с прогрессом — очереди строятся в памяти (без N+1).
    const cards = await context.db.card.findMany({
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

    // Ответы за сегодня: убирают уже отвеченные карточки из плана и двигают серию.
    const countsByDay = await reviewCountsByMskDay(context.db, userId);
    const cardsDoneToday = countsByDay.get(mskDayKey(now)) ?? 0;

    const planInputs: PlanExamInput[] = [];
    const examSummaries: {
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
    }[] = [];

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

    const streak = streakFromReviewDays({
      countsByDay,
      restWeekdays: settings.restWeekdays,
      freezesLeft: settings.streakFreezesLeft,
      todayPlanDone: !planTotal && cardsDoneToday > 0,
      now,
    });

    const pro = await hasActivePro(context.db, userId);
    const cramExamIds = examSummaries
      .filter((exam) => exam.daysToExam !== null && exam.daysToExam >= 0 && exam.daysToExam <= CRAM_SUGGEST_DAYS)
      .map((exam) => exam.examId);

    return {
      exams: examSummaries,
      plan,
      planTotal,
      cardsDoneToday,
      streakDays: streak.days,
      freezesSpent: streak.freezesSpent,
      freezesLeft: settings.streakFreezesLeft,
      restWeekdays: settings.restWeekdays,
      dailyMinutesTotal: settings.dailyMinutesTotal,
      suggestions: {
        // Вечером предлагаем лёгкое предсонное повторение уже пройденного.
        bedtime: mskHourOf(now) >= BEDTIME_SUGGEST_HOUR && cardsDoneToday > 0,
        // Умная зубрёжка (Pro) — по экзаменам, до которых ≤ 2 дней.
        cramExamIds,
        pro,
      },
    };
  });

