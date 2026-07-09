import { createServerFn } from "@tanstack/react-start";

import { mskDayKey } from "~/lib";
import { authMiddleware } from "~/server/middleware";
import { examReadinessMap } from "~/server/readiness";
import { reviewCountsByMskDay, streakFromReviewDays } from "~/server/streak";
import { loadUserSettings } from "~/server/userSettings";

// Минимальная сводка по новым моделям: активность, серия, готовности экзаменов.
// Детальную аналитику (калибровка, слабые темы, прогноз-против-факта) построит волна 4.

const ACTIVITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const getOverallStats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const now = new Date();

    const [exams, totalCards, reviewGroups, countsByDay, settings] = await Promise.all([
      context.db.exam.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, examDate: true, archivedAt: true },
      }),
      context.db.card.count({ where: { exam: { userId } } }),
      context.db.review.groupBy({ by: ["correct"], where: { userId }, _count: { _all: true } }),
      reviewCountsByMskDay(context.db, userId),
      loadUserSettings(context.db, userId, new Date()),
    ]);

    const correctCount = reviewGroups.find((group) => group.correct)?._count._all ?? 0;
    const totalReviews = reviewGroups.reduce((sum, group) => sum + group._count._all, 0);

    // Активность за последние ACTIVITY_DAYS дней (дни без ответов — нули).
    const activity: { date: string; count: number }[] = [];
    for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset -= 1) {
      const key = mskDayKey(new Date(now.getTime() - offset * DAY_MS));
      activity.push({ date: key, count: countsByDay.get(key) ?? 0 });
    }

    const streak = streakFromReviewDays({
      countsByDay,
      restWeekdays: settings.restWeekdays,
      freezesLeft: settings.streakFreezesLeft,
      todayPlanDone: false,
      now,
    });

    const readinessByExam = await examReadinessMap(
      context.db,
      userId,
      exams.map((exam) => exam.id),
      now,
    );

    return {
      totalExams: exams.length,
      totalCards,
      totalReviews,
      accuracy: totalReviews > 0 ? correctCount / totalReviews : 0,
      reviewsToday: countsByDay.get(mskDayKey(now)) ?? 0,
      streakDays: streak.days,
      activity,
      exams: exams.map((exam) => ({
        examId: exam.id,
        title: exam.title,
        examDate: exam.examDate,
        archived: Boolean(exam.archivedAt),
        readiness: readinessByExam.get(exam.id) ?? 0,
      })),
    };
  });
