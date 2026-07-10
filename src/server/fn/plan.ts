import { type PrismaClient } from "@prisma/client";
import { createServerFn } from "@tanstack/react-start";

import { startOfDayMsk } from "~/lib";
import { computeTodayState, type TodayExamSummary } from "~/server/dailyPlan";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";

// План дня по всем активным экзаменам + серия/заморозки + предложения bedtime/cram.
// Расчёт плана и серии — в общем computeTodayState (src/server/dailyPlan.ts).

// Умную зубрёжку предлагаем при ≤ 2 днях до экзамена.
const CRAM_SUGGEST_DAYS = 2;

function mskHourOf(now: Date): number {
  return (now.getUTCHours() + 3) % 24;
}

// Предсонное повторение прогоняет карточки, пройденные СЕГОДНЯ по конкретному экзамену, —
// поэтому CTA обязан вести на экзамен с сегодняшними ответами (самый занимавшийся),
// а не на первый блок плана: иначе у Pro с несколькими экзаменами кнопка открывала бы пустую очередь.
async function pickBedtimeExamId(
  db: PrismaClient,
  userId: string,
  activeExams: readonly TodayExamSummary[],
  now: Date,
): Promise<string | null> {
  const reviewedToday = await db.review.groupBy({
    by: ["examId"],
    where: { userId, reviewedAt: { gte: startOfDayMsk(now) } },
    _count: { _all: true },
  });
  const activeIds = new Set(activeExams.map((exam) => exam.examId));
  const mostReviewed = reviewedToday
    .filter((row) => activeIds.has(row.examId))
    .sort((left, right) => right._count._all - left._count._all)[0];
  return mostReviewed?.examId ?? null;
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
    const bedtimeReady = bedtimeHour !== null && mskHourOf(now) >= bedtimeHour && today.cardsDoneToday > 0;
    const bedtimeExamId = bedtimeReady ? await pickBedtimeExamId(context.db, userId, today.exams, now) : null;
    return {
      exams: today.exams,
      plan: today.plan,
      planTotal: today.planTotal,
      cardsDoneToday: today.cardsDoneToday,
      streakDays: today.streakDays,
      freezesLeft: today.freezesLeft,
      restWeekdays: today.settings.restWeekdays,
      dailyMinutesTotal: today.settings.dailyMinutesTotal,
      suggestions: {
        // Предсонное повторение — с настроенного часа (null — напоминание выключено),
        // и только если есть экзамен с сегодняшними ответами (иначе очередь была бы пустой).
        bedtime: Boolean(bedtimeExamId),
        bedtimeExamId,
        // Умная зубрёжка (Pro) — по экзаменам, до которых ≤ 2 дней.
        cramExamIds,
        pro,
      },
    };
  });
