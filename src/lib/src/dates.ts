// Дневные лимиты и даты подписки считаем по календарным дням Москвы (UTC+3, переходов нет).
// Сервер живёт в UTC: сравнение по UTC-дате сбрасывало бы лимиты не в полночь по МСК.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Начало календарного дня в Москве для заданного момента. */
export function startOfDayMsk(moment: Date): Date {
  const shifted = moment.getTime() + MSK_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - MSK_OFFSET_MS);
}

/** Ключ календарного дня МСК «YYYY-MM-DD» — для серий, лимитов и masteredDays. */
export function mskDayKey(moment: Date): string {
  return new Date(moment.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** День недели по МСК: 0 — воскресенье … 6 — суббота (конвенция JS getDay). */
export function mskWeekday(moment: Date): number {
  return new Date(moment.getTime() + MSK_OFFSET_MS).getUTCDay();
}

/** Разница в календарных днях МСК (to − from): 0 — один и тот же день, 1 — завтра. */
export function mskCalendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDayMsk(to).getTime() - startOfDayMsk(from).getTime()) / DAY_MS);
}

// Русские названия месяцев приходят из Intl, поэтому typo() тут не нужен
const dateRuMskFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

/** Дата по московскому календарю для интерфейса: «14 октября 2026 г.». */
export function formatDateRuMsk(moment: Date): string {
  return dateRuMskFormat.format(moment);
}
