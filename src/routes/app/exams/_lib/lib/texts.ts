import { typo } from "~/lib";

/** Русское склонение по числу: pluralRu(3, "день", "дня", "дней") → «дня». */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = Math.abs(count) % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** «5 карточек», «1 карточка» — счётчик карточек с числом. */
export function cardsCountLabel(count: number): string {
  return typo(`${count} ${pluralRu(count, "карточка", "карточки", "карточек")}`);
}

/** «12 вопросов», «21 вопрос» — счётчик вопросов с числом. */
export function questionsCountLabel(count: number): string {
  return typo(`${count} ${pluralRu(count, "вопрос", "вопроса", "вопросов")}`);
}

/** Человеческое «сколько осталось до экзамена»; null — экзамен без даты. */
export function daysToExamLabel(daysToExam: number | null): string | null {
  if (daysToExam === null) return null;
  if (daysToExam < 0) return typo("экзамен прошёл");
  if (daysToExam === 0) return typo("экзамен сегодня");
  if (daysToExam === 1) return typo("экзамен завтра");
  return typo(`до экзамена ${daysToExam} ${pluralRu(daysToExam, "день", "дня", "дней")}`);
}

/** Размер файла для списка материалов. */
export function formatFileSize(sizeBytes: number): string {
  const megabytes = sizeBytes / (1024 * 1024);
  if (megabytes >= 1) return typo(`${megabytes.toFixed(1)} МБ`);
  return typo(`${Math.max(1, Math.round(sizeBytes / 1024))} КБ`);
}

/** Подпись формата карточки для бейджей. */
export function cardFormatLabel(format: string): string {
  const labels: Record<string, string> = {
    open: typo("открытый"),
    mcq: typo("тест"),
    cloze: typo("пропуск"),
    truefalse: typo("верно/неверно"),
  };
  return labels[format] ?? format;
}

/** Тексты ошибок загрузки материалов по машиночитаемым кодам /api/materials. */
export const uploadErrorText: Record<string, string> = {
  FILE_TOO_LARGE: typo("Файл больше 10 МБ"),
  FILE_TYPE: typo("Поддерживаются файлы pdf, docx, doc, txt и md"),
  TOO_MANY_FILES: typo("Не больше 5 файлов на экзамен"),
  EMPTY: typo("Выберите файлы"),
  UPLOAD_FAILED: typo("Не удалось загрузить материалы"),
};
