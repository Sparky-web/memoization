import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { mskCalendarDaysBetween, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// «Прогноз против факта» (метапознание): перед daily-сессией пользователь предсказывает
// процент вспомненного, после — сравниваем с реальностью. Отложенная самооценка точнее
// ощущения «я знаю» и разрушает иллюзию беглости (спека, эффект ≈ 0,93).

/** Прогноз предлагаем не раньше, чем накопится материал для честного сравнения. */
const MIN_ANSWERED_CARDS = 15;
/** Не чаще раза в 5 дней — иначе ритуал приестся и перестанет работать. */
const MIN_DAYS_BETWEEN_FORECASTS = 5;
/** Неразрешённый прогноз старше суток считаем брошенным — не резолвим задним числом. */
const RESOLVE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Повторный резолв (StrictMode, перерисовка итога) возвращает только что разрешённый прогноз. */
const RESOLVED_ECHO_WINDOW_MS = 10 * 60 * 1000;

export const maybeGetForecastPrompt = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId, archivedAt: null },
      select: { id: true },
    });
    if (!exam) return { shouldPrompt: false };

    const lastForecast = await context.db.forecastCheck.findFirst({
      where: { userId, examId: exam.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, resolvedAt: true },
    });
    const now = new Date();
    // Свежий висящий прогноз (сессию прервали) резолвится ближайшим завершением — новый не предлагаем.
    // Висящий дольше суток — брошенный: резолву он уже не подлежит и блокировать предложение навсегда не должен.
    const freshPending =
      lastForecast && !lastForecast.resolvedAt && now.getTime() - lastForecast.createdAt.getTime() < RESOLVE_WINDOW_MS;
    if (
      freshPending ||
      (lastForecast && mskCalendarDaysBetween(lastForecast.createdAt, now) < MIN_DAYS_BETWEEN_FORECASTS)
    ) {
      return { shouldPrompt: false };
    }

    const answeredCards = await context.db.review.findMany({
      where: { userId, examId: exam.id },
      distinct: ["cardId"],
      select: { cardId: true },
    });
    return { shouldPrompt: answeredCards.length >= MIN_ANSWERED_CARDS };
  });

export const createForecast = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      examId: zodRussian.string(),
      predictedPercent: zodRussian.number().int().min(0).max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    const forecast = await context.db.forecastCheck.create({
      data: { userId, examId: exam.id, predictedPercent: data.predictedPercent },
      select: { id: true },
    });
    return { id: forecast.id };
  });

// Итог сессии зовёт резолв всегда: нет свежего неразрешённого прогноза — вернём null без ошибки.
export const resolveForecast = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      examId: zodRussian.string(),
      actualPercent: zodRussian.number().int().min(0).max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const now = new Date();
    const pending = await context.db.forecastCheck.findFirst({
      where: {
        userId,
        examId: data.examId,
        resolvedAt: null,
        createdAt: { gte: new Date(now.getTime() - RESOLVE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, predictedPercent: true },
    });
    if (!pending) {
      // Идемпотентность: повторный вызов (двойной эффект StrictMode, повторный рендер итога)
      // возвращает свежеразрешённый прогноз, а не null — иначе сравнение мигало бы и пропадало.
      const justResolved = await context.db.forecastCheck.findFirst({
        where: {
          userId,
          examId: data.examId,
          resolvedAt: { gte: new Date(now.getTime() - RESOLVED_ECHO_WINDOW_MS) },
        },
        orderBy: { resolvedAt: "desc" },
        select: { predictedPercent: true, actualPercent: true },
      });
      if (justResolved && justResolved.actualPercent !== null) {
        return { predictedPercent: justResolved.predictedPercent, actualPercent: justResolved.actualPercent };
      }
      return null;
    }

    await context.db.forecastCheck.update({
      where: { id: pending.id },
      data: { actualPercent: data.actualPercent, resolvedAt: now },
    });
    return { predictedPercent: pending.predictedPercent, actualPercent: data.actualPercent };
  });
