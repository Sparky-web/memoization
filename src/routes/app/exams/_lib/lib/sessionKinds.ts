import { typo } from "~/lib";

/** Режим сессии припоминания — совпадает с валидатором startSession. */
export type SessionKind = "daily" | "pretest" | "bedtime" | "cram" | "swipe";

/** Заголовки режимов для плеера и ссылок. */
export const SESSION_KIND_TITLES: Record<SessionKind, string> = {
  daily: typo("Сессия дня"),
  pretest: typo("Претест: сначала бой"),
  bedtime: typo("Повторение перед сном"),
  cram: typo("Умная зубрёжка"),
  swipe: typo("Повторение свайпами"),
};

/** Час по МСК (0–23) — для защиты сна в зубрёжке и вечерних предложений. */
export function mskHourOf(moment: Date): number {
  return (moment.getUTCHours() + 3) % 24;
}

/** «Пора спать»: с 23:00 до 5:00 МСК зубрёжка мягко предлагает завершиться. */
export function isSleepTimeMsk(moment: Date): boolean {
  const hour = mskHourOf(moment);
  return hour >= 23 || hour < 5;
}
