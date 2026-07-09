import { typo } from "./typo";
import { zodRussian } from "./zodRussian";

// Формат файлов answers.json и cards.json двухпроходного пайплайна генерации
// (docs/domashnik.md, раздел 4). Схемы живут в lib: сервер валидирует выход модели,
// клиент переиспользует типы карточек.

const generatedAnswerSchema = zodRussian.object({
  /** Номер вопроса из questions.txt, с единицы. */
  position: zodRussian.number().int().min(1),
  topic: zodRussian.string().min(1).max(120),
  answerMd: zodRussian.string().min(1).max(30000),
  covered: zodRussian.boolean(),
  aiGenerated: zodRussian.boolean(),
  /** «имя файла: короткая цитата» — только для ответов из материалов. */
  sourceRef: zodRussian.string().min(1).max(300).nullable(),
});

const MCQ_OPTIONS_COUNT = 4;

const generatedCardSchema = zodRussian
  .object({
    format: zodRussian.enum(["open", "mcq", "cloze", "truefalse"]),
    prompt: zodRussian.string().min(1).max(4000),
    answer: zodRussian.string().min(1).max(8000),
    options: zodRussian.array(zodRussian.string().min(1).max(600)).max(8).default([]),
    explanation: zodRussian.string().min(1).max(2000),
  })
  .superRefine((card, ctx) => {
    if (card.format === "mcq" && card.options.length !== MCQ_OPTIONS_COUNT) {
      ctx.addIssue({ code: "custom", message: typo(`у теста должно быть ровно ${MCQ_OPTIONS_COUNT} варианта`) });
    }
    if (card.format === "mcq" && card.options.length === MCQ_OPTIONS_COUNT && !card.options.includes(card.answer)) {
      ctx.addIssue({ code: "custom", message: typo("правильный ответ теста должен дословно совпадать с одним из вариантов") });
    }
    if (card.format === "cloze" && !card.prompt.includes("___")) {
      ctx.addIssue({ code: "custom", message: typo("в тексте с пропуском нет «___»") });
    }
    if (card.format === "truefalse" && card.answer !== "true" && card.answer !== "false") {
      ctx.addIssue({ code: "custom", message: typo("ответ «верно/неверно» — строго true или false") });
    }
  });

const generatedQuestionCardsSchema = zodRussian.object({
  /** Номер вопроса из questions.txt, с единицы. */
  position: zodRussian.number().int().min(1),
  cards: zodRussian.array(generatedCardSchema).min(1).max(8),
});

const answersFileSchema = zodRussian.array(generatedAnswerSchema).min(1);
const cardsFileSchema = zodRussian.array(generatedQuestionCardsSchema).min(1);
const cardListSchema = zodRussian.array(generatedCardSchema).min(1).max(8);

/** Ответ на один вопрос из answers.json (проход A). */
export type GeneratedAnswer = ReturnType<typeof generatedAnswerSchema.parse>;
/** Одна сгенерированная карточка (проход B и точечная перегенерация). */
export type GeneratedCard = ReturnType<typeof generatedCardSchema.parse>;
/** Пачка карточек одного вопроса из cards.json. */
export type GeneratedQuestionCards = ReturnType<typeof generatedQuestionCardsSchema.parse>;

// Клод иногда оборачивает JSON в ```json-ограждение — снимаем его перед разбором.
function stripCodeFences(rawText: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(rawText.trim());
  return fenced?.[1] ?? rawText;
}

function parseJson(rawText: string, fileLabel: string): unknown {
  try {
    const parsed: unknown = JSON.parse(stripCodeFences(rawText).trim());
    return parsed;
  } catch {
    throw new Error(typo(`${fileLabel}: результат не является валидным JSON`));
  }
}

function firstIssueMessage(error: unknown): string {
  if (error instanceof zodRussian.ZodError) {
    const issue = error.issues[0];
    if (issue) return `${issue.path.join(".")}: ${issue.message}`;
  }
  return error instanceof Error ? error.message : typo("неизвестная ошибка");
}

// Каждый вопрос покрыт ровно один раз: позиции 1..questionCount без пропусков и повторов.
function assertPositionsExact(positions: number[], questionCount: number, fileLabel: string): void {
  const seen = new Set(positions);
  if (seen.size !== positions.length) {
    throw new Error(typo(`${fileLabel}: позиции вопросов повторяются`));
  }
  for (let position = 1; position <= questionCount; position += 1) {
    if (!seen.has(position)) {
      throw new Error(typo(`${fileLabel}: нет записи для вопроса №${position}`));
    }
  }
  if (positions.length !== questionCount) {
    throw new Error(typo(`${fileLabel}: есть записи с позициями вне списка вопросов`));
  }
}

/** Разбор answers.json прохода A: все вопросы покрыты ровно один раз, отсортировано по позиции. */
export function parseGeneratedAnswers(rawText: string, questionCount: number): GeneratedAnswer[] {
  const fileLabel = typo("Проход «Ответы»");
  const json = parseJson(rawText, fileLabel);
  let answers: GeneratedAnswer[];
  try {
    answers = answersFileSchema.parse(json);
  } catch (error) {
    throw new Error(`${fileLabel}: ${firstIssueMessage(error)}`, { cause: error });
  }
  assertPositionsExact(
    answers.map((answer) => answer.position),
    questionCount,
    fileLabel,
  );
  return [...answers].sort((left, right) => left.position - right.position);
}

/** Разбор cards.json прохода B: у каждого вопроса ≥1 валидная карточка, отсортировано по позиции. */
export function parseGeneratedCards(rawText: string, questionCount: number): GeneratedQuestionCards[] {
  const fileLabel = typo("Проход «Карточки»");
  const json = parseJson(rawText, fileLabel);
  let questionCards: GeneratedQuestionCards[];
  try {
    questionCards = cardsFileSchema.parse(json);
  } catch (error) {
    throw new Error(`${fileLabel}: ${firstIssueMessage(error)}`, { cause: error });
  }
  assertPositionsExact(
    questionCards.map((entry) => entry.position),
    questionCount,
    fileLabel,
  );
  return [...questionCards].sort((left, right) => left.position - right.position);
}

/** Разбор плоского списка карточек — точечная перегенерация карточек одного вопроса. */
export function parseGeneratedCardList(rawText: string): GeneratedCard[] {
  const fileLabel = typo("Перегенерация карточек");
  const json = parseJson(rawText, fileLabel);
  try {
    return cardListSchema.parse(json);
  } catch (error) {
    throw new Error(`${fileLabel}: ${firstIssueMessage(error)}`, { cause: error });
  }
}
