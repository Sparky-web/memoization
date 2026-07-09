// Проверка закрытых ответов и перемешивание вариантов — изоморфные помощники сессии.

/** Случайный порядок (decorate-sort-undecorate) — варианты mcq/cloze перед выдачей клиенту. */
export function shuffleItems<Item>(items: readonly Item[]): Item[] {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item);
}

/**
 * Нормализация ответа cloze для сравнения: крайние пробелы, регистр,
 * сжатие пробелов и хвостовая пунктуация. Сравнение терпимо к мелочам ввода.
 */
export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/u, "");
}
