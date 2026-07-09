// Живой парсинг вставленного списка вопросов: строка = вопрос; нумерация «1.» / «1)»
// и маркеры списка срезаются, пустые строки игнорируются.

const LINE_PREFIX = /^\s*(?:\d+\s*[.)]\s*|[•*–—-]\s+)/;

/** Разбирает текст textarea в список вопросов. */
export function parseQuestionList(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(LINE_PREFIX, "").trim())
    .filter(Boolean);
}
