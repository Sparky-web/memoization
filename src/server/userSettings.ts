import { type PrismaClient } from "@prisma/client";

// Настройки с дефолтами: строка UserSettings создаётся только при первом изменении,
// до этого работаем на значениях по умолчанию. Заморозки серии здесь не живут —
// их остаток считается по журналу StreakDay (src/server/streak.ts, скользящие 30 дней).

export interface EffectiveUserSettings {
  dailyMinutesTotal: number;
  restWeekdays: number[];
  /** null — предсонное напоминание выключено пользователем. */
  bedtimeHour: number | null;
  /** Час дневного push-напоминания о плане по МСК; null — выключено. */
  dailyReminderHour: number | null;
  aiCheckEnabled: boolean;
}

/** Час предсонного напоминания по умолчанию — им же живут пользователи без строки настроек. */
export const DEFAULT_BEDTIME_HOUR = 21;
/** Час дневного напоминания по умолчанию — им же живут пользователи без строки настроек. */
export const DEFAULT_DAILY_REMINDER_HOUR = 18;

const DEFAULT_SETTINGS: EffectiveUserSettings = {
  dailyMinutesTotal: 25,
  restWeekdays: [],
  bedtimeHour: DEFAULT_BEDTIME_HOUR,
  dailyReminderHour: DEFAULT_DAILY_REMINDER_HOUR,
  aiCheckEnabled: false,
};

/** Настройки пользователя (или дефолты). */
export async function loadUserSettings(db: PrismaClient, userId: string): Promise<EffectiveUserSettings> {
  const row = await db.userSettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_SETTINGS };

  return {
    dailyMinutesTotal: row.dailyMinutesTotal,
    restWeekdays: row.restWeekdays,
    bedtimeHour: row.bedtimeHour,
    dailyReminderHour: row.dailyReminderHour,
    aiCheckEnabled: row.aiCheckEnabled,
  };
}
