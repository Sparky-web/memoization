import { typo } from "~/lib";

// Форматирование чисел, денег и дат для админки.

const numberFormat = new Intl.NumberFormat("ru-RU");

/** Целое с разрядами: «12 345». */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Сумма в копейках → рубли с разрядами: «1 234 ₽» (дробная часть — только ненулевая). */
export function formatRub(kopecks: number): string {
  const rub = Math.round(kopecks) / 100;
  return `${numberFormat.format(rub)}\u00A0₽`;
}

const daysPluralRules = new Intl.PluralRules("ru-RU");

const DAYS_WORDS: Record<string, string> = {
  one: typo("день"),
  few: typo("дня"),
  many: typo("дней"),
  other: typo("дней"),
};

/** Срок в днях со склонением: «30 дней», «91 день». */
export function formatDays(count: number): string {
  return `${numberFormat.format(count)} ${DAYS_WORDS[daysPluralRules.select(count)] ?? typo("дней")}`;
}

const dateTimeMskFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

/** Дата и время по Москве: «09.07.2026, 15:04». */
export function formatDateTimeMsk(moment: Date): string {
  return dateTimeMskFormat.format(moment);
}
