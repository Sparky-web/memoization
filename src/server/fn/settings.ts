import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { PAYWALL_ERRORS, zodRussian } from "~/lib";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";
import { freezesLeftOf, streakJournal } from "~/server/streak";
import { DEFAULT_BEDTIME_HOUR, DEFAULT_DAILY_REMINDER_HOUR, loadUserSettings } from "~/server/userSettings";

// Настройки пользователя: дневной бюджет минут, дни отдыха, час дневного и предсонного
// напоминаний, ИИ-сверка открытых ответов (Pro). Строка создаётся при первом изменении;
// чтение отдаёт дефолты.

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const [settings, journal] = await Promise.all([
      loadUserSettings(context.db, userId),
      streakJournal(context.db, userId),
    ]);
    return {
      dailyMinutesTotal: settings.dailyMinutesTotal,
      restWeekdays: settings.restWeekdays,
      // Остаток заморозок — из журнала StreakDay: та же точка правды, что «Сегодня» и статистика.
      freezesLeft: freezesLeftOf(journal.frozenDayKeys, new Date()),
      bedtimeHour: settings.bedtimeHour,
      dailyReminderHour: settings.dailyReminderHour,
      aiCheckEnabled: settings.aiCheckEnabled,
    };
  });

const settingsFieldsInput = zodRussian.object({
  dailyMinutesTotal: zodRussian.number().int().min(5).max(240).optional(),
  restWeekdays: zodRussian.array(zodRussian.number().int().min(0).max(6)).max(7).optional(),
  bedtimeHour: zodRussian.number().int().min(0).max(23).nullable().optional(),
  dailyReminderHour: zodRussian.number().int().min(0).max(23).nullable().optional(),
  aiCheckEnabled: zodRussian.boolean().optional(),
});

export const updateUserSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(settingsFieldsInput)
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    // Сама ИИ-сверка — платная функция: включить переключатель без Pro нельзя (выключить — можно).
    if (data.aiCheckEnabled && !(await hasActivePro(context.db, userId))) {
      setResponseStatus(402);
      throw new Error(PAYWALL_ERRORS.AI_CHECK);
    }
    const restWeekdays = data.restWeekdays ? [...new Set(data.restWeekdays)] : undefined;
    await context.db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        dailyMinutesTotal: data.dailyMinutesTotal ?? 25,
        restWeekdays: restWeekdays ?? [],
        bedtimeHour: data.bedtimeHour !== undefined ? data.bedtimeHour : DEFAULT_BEDTIME_HOUR,
        dailyReminderHour:
          data.dailyReminderHour !== undefined ? data.dailyReminderHour : DEFAULT_DAILY_REMINDER_HOUR,
        aiCheckEnabled: data.aiCheckEnabled ?? false,
      },
      update: {
        ...(data.dailyMinutesTotal !== undefined ? { dailyMinutesTotal: data.dailyMinutesTotal } : {}),
        ...(restWeekdays ? { restWeekdays } : {}),
        ...(data.bedtimeHour !== undefined ? { bedtimeHour: data.bedtimeHour } : {}),
        ...(data.dailyReminderHour !== undefined ? { dailyReminderHour: data.dailyReminderHour } : {}),
        ...(data.aiCheckEnabled !== undefined ? { aiCheckEnabled: data.aiCheckEnabled } : {}),
      },
    });
    return true;
  });
