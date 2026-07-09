// Мягкие подсказки-привычки: детерминированные и ненавязчивые. Непрерывный фокус
// меряем по sessionStorage (только клиент, только в обработчиках событий).

const FOCUS_RUN_START_KEY = "focus-run-start";
const FOCUS_LAST_ACTIVITY_KEY = "focus-last-activity";
const FOCUS_BREAK_SHOWN_KEY = "focus-break-shown";
/** Пауза дольше 10 минут — отсчёт непрерывного занятия начинается заново. */
const FOCUS_GAP_MS = 10 * 60 * 1000;
/** После 40 минут подряд предлагаем перерыв (помодоро-диапазон 25–50 минут). */
const FOCUS_BREAK_AFTER_MINUTES = 40;

function readNumber(key: string): number {
  return Number(sessionStorage.getItem(key)) || 0;
}

/** Отметка активности занятия: обновляет отсчёт непрерывного фокуса. */
export function recordFocusActivity(nowMs: number = Date.now()): void {
  const lastActivity = readNumber(FOCUS_LAST_ACTIVITY_KEY);
  const runStart = readNumber(FOCUS_RUN_START_KEY);
  if (!runStart || nowMs - lastActivity > FOCUS_GAP_MS) {
    sessionStorage.setItem(FOCUS_RUN_START_KEY, String(nowMs));
    sessionStorage.removeItem(FOCUS_BREAK_SHOWN_KEY);
  }
  sessionStorage.setItem(FOCUS_LAST_ACTIVITY_KEY, String(nowMs));
}

/** Пора ли предложить перерыв: ≥ 40 минут фокуса подряд, не чаще раза за отрезок. */
export function shouldSuggestFocusBreak(nowMs: number = Date.now()): boolean {
  if (sessionStorage.getItem(FOCUS_BREAK_SHOWN_KEY)) return false;
  const runStart = readNumber(FOCUS_RUN_START_KEY);
  if (!runStart) return false;
  return nowMs - runStart >= FOCUS_BREAK_AFTER_MINUTES * 60 * 1000;
}

/** Предложение перерыва показано — до следующего отрезка фокуса не повторяем. */
export function markFocusBreakShown(): void {
  sessionStorage.setItem(FOCUS_BREAK_SHOWN_KEY, "1");
}

/**
 * Подсказка о прогулке — примерно в каждом третьем итоге сессии, детерминированно
 * по дню МСК: в течение дня не мигает и не зависит от случайности.
 */
export function isWalkNudgeDay(dayKey: string): boolean {
  let hash = 0;
  for (const char of dayKey) hash += char.charCodeAt(0);
  return hash % 3 === 0;
}
