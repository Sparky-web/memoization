import type * as z from "zod";

import { zodRussian } from "./zodRussian";

// Формат, который Клод пишет в output.json при генерации экзамена (волна 2 заменит его
// на двухпроходный answers.json/cards.json — см. docs/domashnik.md, раздел 4).

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

// Клод иногда оборачивает JSON в ```json-ограждение. Снимаем его.
function stripCodeFences(rawText: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(rawText.trim());
  return fenced?.[1] ?? rawText;
}

/** Разбор output.json, который пишет claude -p при генерации экзамена. */
export function parseGeneratedDeck(rawText: string): GeneratedDeck {
  const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
  return generatedDeckSchema.parse(parsed);
}
