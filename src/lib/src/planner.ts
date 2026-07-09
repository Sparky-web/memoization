// Планировщик дня и готовность: чистые функции без БД — сервер собирает входы,
// здесь только математика распределения и серий. Дни — календарные МСК (см. dates.ts).

import { mskDayKey, mskWeekday } from "./dates";

/** Честная готовность 0..1 = средняя вероятность припоминания по карточкам (новая = 0). */
export function readiness(cards: readonly { retrievability: number }[]): number {
  if (!cards.length) return 0;
  const sum = cards.reduce((total, card) => total + card.retrievability, 0);
  return sum / cards.length;
}

/** Новая карточка в очереди плана: topic нужен для интерливинга тем внутри блока. */
export interface PlanNewCard {
  id: string;
  topic: string | null;
}

/** Вход планировщика по одному экзамену: очереди уже отсортированы сервером. */
export interface PlanExamInput {
  examId: string;
  /** Календарных дней МСК до экзамена; null — экзамен без даты (режим поддержки). */
  daysToExam: number | null;
  readiness: number;
  /** Уверенные промахи — показываются первыми. */
  priorityCardIds: readonly string[];
  /** Due по FSRS, отсортированы по убыванию просроченности. */
  dueCardIds: readonly string[];
  /** Новые (без прогресса), по позиции; темы чередуются внутри блока. */
  newCardIds: readonly PlanNewCard[];
}

/** Блок плана дня: карточки одного экзамена в порядке показа. */
export interface DailyPlanBlock {
  examId: string;
  cardIds: string[];
}

// Срочность: экзамен через 1 день в ~13 раз важнее экзамена через 47+ дней; без даты — фон 0.3.
function urgencyOf(daysToExam: number | null): number {
  if (daysToExam === null) return 0.3;
  return Math.min(Math.max(14 / Math.max(daysToExam, 1), 0.3), 4);
}

// Потребность: чем ниже готовность, тем больше слотов. Пол 0.05 — у полностью готового
// экзамена due-карточки всё равно должны попадать в план (иначе готовность и упадёт).
function needOf(examReadiness: number): number {
  return Math.max(1 - examReadiness, 0.05);
}

// Интерливинг: новые карточки чередуются по темам (round-robin по порядку появления тем).
function interleaveByTopic(cards: readonly PlanNewCard[]): string[] {
  const buckets = new Map<string, string[]>();
  for (const card of cards) {
    const key = card.topic ?? "";
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(card.id);
    } else {
      buckets.set(key, [card.id]);
    }
  }
  const topicQueues = [...buckets.values()];
  const result: string[] = [];
  for (let round = 0; result.length < cards.length; round += 1) {
    for (const queue of topicQueues) {
      const cardId = queue[round];
      if (cardId) result.push(cardId);
    }
  }
  return result;
}

// Очередь экзамена в порядке показа: приоритетные → due (по просроченности) → новые (интерливинг тем).
function examQueue(exam: PlanExamInput): string[] {
  return [...exam.priorityCardIds, ...exam.dueCardIds, ...interleaveByTopic(exam.newCardIds)];
}

/**
 * План дня: дневная ёмкость (карточек) делится между экзаменами по весу urgency × need,
 * квоты — по наибольшим остаткам, излишки (когда карточек меньше квоты) отдаются другим
 * экзаменам по весу. Блоки — в порядке убывания веса (самое срочное — первым).
 */
export function buildDailyPlan(input: {
  exams: readonly PlanExamInput[];
  capacityCards: number;
}): DailyPlanBlock[] {
  const candidates = input.exams
    .map((exam) => ({
      exam,
      queue: examQueue(exam),
      weight: urgencyOf(exam.daysToExam) * needOf(exam.readiness),
      quota: 0,
    }))
    .filter((candidate) => candidate.queue.length)
    .sort((left, right) => right.weight - left.weight);

  const totalAvailable = candidates.reduce((sum, candidate) => sum + candidate.queue.length, 0);
  const remaining = Math.min(Math.max(Math.floor(input.capacityCards), 0), totalAvailable);
  if (!candidates.length || !remaining) return [];

  // Квоты по наибольшим остаткам (веса кандидатов > 0 всегда: пол need = 0.05, urgency ≥ 0.3).
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const shares = candidates.map((candidate) => (remaining * candidate.weight) / totalWeight);
  candidates.forEach((candidate, index) => {
    candidate.quota = Math.floor(shares[index] ?? 0);
  });
  let assigned = candidates.reduce((sum, candidate) => sum + candidate.quota, 0);
  const byRemainder = candidates
    .map((candidate, index) => ({ candidate, remainder: (shares[index] ?? 0) - candidate.quota }))
    .sort((left, right) => right.remainder - left.remainder);
  for (const entry of byRemainder) {
    if (assigned >= remaining) break;
    entry.candidate.quota += 1;
    assigned += 1;
  }

  // Кап по фактическому числу карточек; излишек раздаём экзаменам со свободной очередью по весу.
  let overflow = 0;
  for (const candidate of candidates) {
    if (candidate.quota > candidate.queue.length) {
      overflow += candidate.quota - candidate.queue.length;
      candidate.quota = candidate.queue.length;
    }
  }
  while (overflow > 0) {
    const spare = candidates.find((candidate) => candidate.quota < candidate.queue.length);
    if (!spare) break;
    spare.quota += 1;
    overflow -= 1;
  }

  return candidates
    .filter((candidate) => candidate.quota > 0)
    .map((candidate) => ({ examId: candidate.exam.examId, cardIds: candidate.queue.slice(0, candidate.quota) }));
}

/** Вход подсчёта серии: дни выполнения плана (ключи МСК), дни отдыха и остаток заморозок. */
export interface StreakInput {
  now: Date;
  /** Ключи МСК-дней (см. mskDayKey), в которые дневной план выполнен. */
  completedDayKeys: ReadonlySet<string>;
  /** Запланированные дни отдыха: 0 — воскресенье … 6 — суббота (МСК) — серию не рвут. */
  restWeekdays: readonly number[];
  /** Сколько заморозок доступно: пропуски сверх них рвут серию. */
  freezesLeft: number;
}

export interface StreakResult {
  /** Длина серии в выполненных днях (дни отдыха и заморозки серию сохраняют, но не удлиняют). */
  days: number;
  /** Сколько заморозок «виртуально» потрачено на пропуски внутри серии. */
  freezesSpent: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Дальше года не ходим: и серия такой длины уже подвиг, и цикл гарантированно конечен.
const MAX_STREAK_LOOKBACK_DAYS = 366;

/**
 * Серия по календарным дням МСК от сегодня назад. Сегодняшний невыполненный день серию
 * не рвёт (день ещё не кончился); прошлый пропуск закрывается днём отдыха или заморозкой.
 */
export function computeStreak(input: StreakInput): StreakResult {
  const restWeekdays = new Set(input.restWeekdays);
  let days = 0;
  let freezesSpent = 0;
  // Заморозка тратится, только если за пропуском (глубже в прошлом) есть выполненный день:
  // хвост пропусков без продолжения серии заморозки жечь не должен.
  let pendingFreezes = 0;

  for (let offset = 0; offset < MAX_STREAK_LOOKBACK_DAYS; offset += 1) {
    const moment = new Date(input.now.getTime() - offset * DAY_MS);
    if (input.completedDayKeys.has(mskDayKey(moment))) {
      days += 1;
      freezesSpent += pendingFreezes;
      pendingFreezes = 0;
      continue;
    }
    if (!offset) continue; // сегодня ещё можно успеть
    if (restWeekdays.has(mskWeekday(moment))) continue;
    if (freezesSpent + pendingFreezes < input.freezesLeft) {
      pendingFreezes += 1;
      continue;
    }
    break;
  }

  return { days, freezesSpent };
}

// Ключ МСК-дня → момент полуночи этого дня (для итерации по календарю в longestStreak).
function mskDayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+03:00`);
}

/**
 * Лучшая серия за всю историю: самый длинный отрезок выполненных дней, где пропуски
 * закрыты только днями отдыха. Заморозки в прошлое не ретроспектируем — их расход
 * по историческим пропускам не восстановим, поэтому «лучший стрик» считается строже текущего.
 */
export function longestStreak(input: { completedDayKeys: ReadonlySet<string>; restWeekdays: readonly number[] }): number {
  const restWeekdays = new Set(input.restWeekdays);
  const sortedDays = [...input.completedDayKeys].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const dayKey of sortedDays) {
    const current = mskDayKeyToDate(dayKey);
    let bridged = false;
    if (previous) {
      bridged = true;
      // Все дни между выполненными должны быть днями отдыха, иначе серия начинается заново.
      for (let time = previous.getTime() + DAY_MS; time < current.getTime(); time += DAY_MS) {
        if (!restWeekdays.has(mskWeekday(new Date(time)))) {
          bridged = false;
          break;
        }
      }
    }
    run = bridged ? run + 1 : 1;
    best = Math.max(best, run);
    previous = current;
  }

  return best;
}
