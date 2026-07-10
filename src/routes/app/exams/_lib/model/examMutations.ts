import { zodRussian } from "~/lib";

// Реэкспорт мутаций домена для компонентов _lib и страниц: по правилам сегментов
// components не зовут server functions напрямую — только через model.
export { addCard, deleteCard, flagCard, suspendCard, updateCard } from "~/server/fn/cards";
export { askCardChat, getCardChat } from "~/server/fn/chat";
export { logEvent } from "~/server/fn/events";
export { archiveExam, deleteExam, generateExam, setExamPaused, setExamPublic, updateExam } from "~/server/fn/exams";
export { createForecast, resolveForecast } from "~/server/fn/forecast";
export { deleteMaterial } from "~/server/fn/materials";
export { regenerateQuestionCards, setExamQuestions } from "~/server/fn/questions";

const uploadErrorSchema = zodRussian.object({ error: zodRussian.string() });

/**
 * Загрузка материалов экзамена (multipart в /api/materials/$examId). Бросает Error
 * с машиночитаемым кодом сервера (FILE_TOO_LARGE, PAYWALL_MATERIALS, …) — текст подбирает UI.
 */
export async function uploadExamMaterials(examId: string, files: readonly File[]): Promise<void> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const response = await fetch(`/api/materials/${examId}`, { method: "POST", body: form });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = uploadErrorSchema.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.error : "UPLOAD_FAILED");
  }
}

const parsedQuestionsSchema = zodRussian.object({ questions: zodRussian.array(zodRussian.string()) });

/**
 * Разбор файла со списком вопросов (multipart в /api/questions/parse, живой sonnet).
 * Бросает Error с кодом (FILE_TOO_LARGE, QUESTIONS_NOT_FOUND, …) или русским текстом сервера.
 */
export async function parseQuestionsFile(file: File): Promise<string[]> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/questions/parse", { method: "POST", body: form });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = uploadErrorSchema.safeParse(payload);
    throw new Error(parsedError.success ? parsedError.data.error : "PARSE_FAILED");
  }
  const parsed = parsedQuestionsSchema.safeParse(payload);
  if (!parsed.success) throw new Error("PARSE_FAILED");
  return parsed.data.questions;
}
