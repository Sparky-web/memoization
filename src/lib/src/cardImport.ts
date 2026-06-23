import type * as z from "zod";

import { zodRussian } from "./zodRussian";

// Формат, который Клод возвращает по нашему промпту: колода = заголовок + массив карточек.
// Схема используется и на сервере (валидатор createDeck), и на клиенте (предпросмотр вставленного JSON).

export const importedCardSchema = zodRussian.object({
  question: zodRussian.string().min(1).max(4000),
  answer: zodRussian.string().min(1).max(8000),
});

export const importedDeckSchema = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).optional(),
  cards: zodRussian.array(importedCardSchema).min(1).max(2000),
});

export type ImportedDeck = z.infer<typeof importedDeckSchema>;

// Пользователь вставляет ответ Клода как есть — иногда в ```json-ограждении. Снимаем его.
function stripCodeFences(rawText: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(rawText.trim());
  return fenced?.[1] ?? rawText;
}

/** Разбор вставленного текста в колоду. Бросает при невалидном JSON или несоответствии схеме. */
export function parseImportedDeck(rawText: string): ImportedDeck {
  const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
  return importedDeckSchema.parse(parsed);
}

// --- Режим «Сгенерировать»: тот же формат, но с двумя ответами (краткий + глубокий markdown) ---

const generatedCardSchema = zodRussian.object({
  question: zodRussian.string().min(1).max(4000),
  answerShort: zodRussian.string().min(1).max(8000),
  answerDeep: zodRussian.string().min(1).max(30000),
});

const generatedDeckSchema = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).optional(),
  cards: zodRussian.array(generatedCardSchema).min(1).max(2000),
});

type GeneratedDeck = z.infer<typeof generatedDeckSchema>;

/** Разбор output.json, который пишет claude -p в режиме «Сгенерировать». */
export function parseGeneratedDeck(rawText: string): GeneratedDeck {
  const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
  return generatedDeckSchema.parse(parsed);
}

// --- Тренажёр: задания «вставь слово» и тесты (отдельные проходы claude) ---

const generatedFillTaskSchema = zodRussian.object({
  prompt: zodRussian.string().min(1).max(2000),
  answer: zodRussian.string().min(1).max(200),
  distractors: zodRussian.array(zodRussian.string().min(1).max(200)).max(8).default([]),
});

const generatedQuizTaskSchema = zodRussian.object({
  question: zodRussian.string().min(1).max(2000),
  options: zodRussian.array(zodRussian.string().min(1).max(600)).min(2).max(8),
  correctIndex: zodRussian.number().int().min(0).max(7),
  explanation: zodRussian.string().max(2000).optional(),
});

// Оба прохода (fill.json / quiz.json) валидируются одной схемой: отсутствующий
// массив подставляется пустым, чтобы файл с одним типом заданий не падал.
const generatedExercisesSchema = zodRussian.object({
  fillTasks: zodRussian.array(generatedFillTaskSchema).max(400).default([]),
  quizTasks: zodRussian.array(generatedQuizTaskSchema).max(400).default([]),
});

export type GeneratedFillTask = z.infer<typeof generatedFillTaskSchema>;
export type GeneratedQuizTask = z.infer<typeof generatedQuizTaskSchema>;
type GeneratedExercises = z.infer<typeof generatedExercisesSchema>;

/** Разбор файла с заданиями/тестами, который пишет claude -p. */
export function parseGeneratedExercises(rawText: string): GeneratedExercises {
  const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
  return generatedExercisesSchema.parse(parsed);
}
