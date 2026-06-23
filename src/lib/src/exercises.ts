// Тренажёр заданий/тестов: размер порции, веса подмешивания и нормализация ответа.
// Чисто изоморфный модуль (зовётся на сервере при сборке сессии и оценке ответа).

/** Сколько заданий выдаём за один заход в режим. */
export const EXERCISE_BATCH_SIZE = 20;

const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 8;
const WRONG_BUMP = 1.5;
const CORRECT_DECAY = 0.6;

/** Новый вес после ответа: ошибка повышает (показываем чаще), верный — понижает. */
export function nextExerciseWeight(weight: number, correct: boolean): number {
  if (correct) {
    return Math.max(weight * CORRECT_DECAY, MIN_WEIGHT);
  }
  return Math.min(weight + WRONG_BUMP, MAX_WEIGHT);
}

/**
 * Взвешенная выборка `count` элементов без повторов: вероятность пропорциональна весу,
 * поэтому задания, на которых пользователь спотыкается, попадают в порцию чаще.
 */
export function sampleByWeight<Item extends { weight: number }>(items: readonly Item[], count: number): Item[] {
  const pool = items.slice();
  const picked: Item[] = [];

  while (pool.length && picked.length < count) {
    const weights = pool.map((item) => Math.max(item.weight, MIN_WEIGHT));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = Math.random() * total;

    let chosenIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      threshold -= weights[index] ?? 0;
      if (threshold <= 0) {
        chosenIndex = index;
        break;
      }
    }

    const chosen = pool[chosenIndex];
    if (chosen) {
      picked.push(chosen);
    }
    pool.splice(chosenIndex, 1);
  }

  return picked;
}

/** Случайный порядок (decorate-sort-undecorate). */
export function shuffleItems<Item>(items: readonly Item[]): Item[] {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item);
}

/**
 * Нормализация ответа «вставь слово» для сравнения: крайние пробелы, регистр,
 * сжатие пробелов и хвостовая пунктуация. Сравнение терпимо к мелочам ввода.
 */
export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/u, "");
}
