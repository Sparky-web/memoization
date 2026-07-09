import { createServerFn } from "@tanstack/react-start";

import { zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";
import { loadUserSettings } from "~/server/userSettings";

// Настройки пользователя: дневной бюджет минут, дни отдыха, час предсонного напоминания.
// Строка создаётся при первом изменении; чтение отдаёт дефолты.

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const settings = await loadUserSettings(context.db, context.session.user.id, new Date());
    return {
      dailyMinutesTotal: settings.dailyMinutesTotal,
      restWeekdays: settings.restWeekdays,
      streakFreezesLeft: settings.streakFreezesLeft,
      bedtimeHour: settings.bedtimeHour,
    };
  });

const settingsFieldsInput = zodRussian.object({
  dailyMinutesTotal: zodRussian.number().int().min(5).max(240).optional(),
  restWeekdays: zodRussian.array(zodRussian.number().int().min(0).max(6)).max(7).optional(),
  bedtimeHour: zodRussian.number().int().min(0).max(23).nullable().optional(),
});

export const updateUserSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(settingsFieldsInput)
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const restWeekdays = data.restWeekdays ? [...new Set(data.restWeekdays)] : undefined;
    await context.db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        dailyMinutesTotal: data.dailyMinutesTotal ?? 25,
        restWeekdays: restWeekdays ?? [],
        bedtimeHour: data.bedtimeHour ?? null,
      },
      update: {
        ...(data.dailyMinutesTotal !== undefined ? { dailyMinutesTotal: data.dailyMinutesTotal } : {}),
        ...(restWeekdays ? { restWeekdays } : {}),
        ...(data.bedtimeHour !== undefined ? { bedtimeHour: data.bedtimeHour } : {}),
      },
    });
    return true;
  });
