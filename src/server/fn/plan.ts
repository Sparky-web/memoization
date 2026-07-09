import { createServerFn } from "@tanstack/react-start";

import { computeTodayState } from "~/server/dailyPlan";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";

// План дня по всем активным экзаменам + серия/заморозки + предложения bedtime/cram.
// Расчёт плана и серии — в общем computeTodayState (src/server/dailyPlan.ts).

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
    const today = await computeTodayState(context.db, userId, now);

    const pro = await hasActivePro(context.db, userId);
    const cramExamIds = today.exams
      .filter((exam) => exam.daysToExam !== null && exam.daysToExam >= 0 && exam.daysToExam <= CRAM_SUGGEST_DAYS)
      .map((exam) => exam.examId);

    const bedtimeHour = today.settings.bedtimeHour;
    return {
      exams: today.exams,
      plan: today.plan,
      planTotal: today.planTotal,
      cardsDoneToday: today.cardsDoneToday,
      streakDays: today.streakDays,
      freezesSpent: today.freezesSpent,
      freezesLeft: today.settings.streakFreezesLeft,
      restWeekdays: today.settings.restWeekdays,
      dailyMinutesTotal: today.settings.dailyMinutesTotal,
      suggestions: {
        // Предсонное повторение — с настроенного часа (null — напоминание выключено).
        bedtime: bedtimeHour !== null && mskHourOf(now) >= bedtimeHour && today.cardsDoneToday > 0,
        // Умная зубрёжка (Pro) — по экзаменам, до которых ≤ 2 дней.
        cramExamIds,
        pro,
      },
    };
  });
