import { type PrismaClient } from "@prisma/client";

import { mskCalendarDaysBetween } from "~/lib";

// Настройки с дефолтами: строка UserSettings создаётся только при первом изменении,
// до этого работаем на значениях по умолчанию.

export interface EffectiveUserSettings {
  dailyMinutesTotal: number;
  restWeekdays: number[];
  streakFreezesLeft: number;
  bedtimeHour: number | null;
}

const DEFAULT_SETTINGS: EffectiveUserSettings = {
  dailyMinutesTotal: 25,
  restWeekdays: [],
  streakFreezesLeft: 2,
  bedtimeHour: null,
};

const FREEZES_PER_MONTH = 2;
const FREEZE_RENEWAL_DAYS = 30;

/** Настройки пользователя (или дефолты) + ежемесячное восстановление заморозок. */
export async function loadUserSettings(db: PrismaClient, userId: string, now: Date): Promise<EffectiveUserSettings> {
  const row = await db.userSettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_SETTINGS };

  let freezesLeft = row.streakFreezesLeft;
  if (!row.freezesRenewedAt || mskCalendarDaysBetween(row.freezesRenewedAt, now) >= FREEZE_RENEWAL_DAYS) {
    freezesLeft = FREEZES_PER_MONTH;
    await db.userSettings.update({
      where: { userId },
      data: { streakFreezesLeft: freezesLeft, freezesRenewedAt: now },
    });
  }

  return {
    dailyMinutesTotal: row.dailyMinutesTotal,
    restWeekdays: row.restWeekdays,
    streakFreezesLeft: freezesLeft,
    bedtimeHour: row.bedtimeHour,
  };
}
