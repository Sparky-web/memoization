import { zodRussian } from "~/lib";

// Реэкспорт мутаций домена для компонентов _lib и страниц: по правилам сегментов
// components не зовут server functions напрямую — только через model.
export { addCard, deleteCard, flagCard, suspendCard, updateCard } from "~/server/fn/cards";
export { askCardChat, getCardChat } from "~/server/fn/chat";
export { logEvent } from "~/server/fn/events";
export { archiveExam, deleteExam, generateExam, setExamPublic, updateExam } from "~/server/fn/exams";
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
