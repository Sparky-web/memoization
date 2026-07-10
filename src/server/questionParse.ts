import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WordExtractor from "word-extractor";

import { typo } from "~/lib";

import { runModelPrompt } from "./chat";

// Разбор загруженного файла со списком вопросов (мастер, шаг «Вопросы»): docx/doc/txt/md
// превращаются в текст на сервере, pdf читает сам claude (Read) во временной папке.

const PARSE_MODEL = "sonnet";
const PARSE_TIMEOUT_MS = 3 * 60 * 1000;
// Потолок текста в промпт: длиннее — почти наверняка не список вопросов, а учебник целиком.
const MAX_PROMPT_TEXT_CHARS = 150_000;

/** Маркер «в документе нет списка вопросов» — модель обязана вывести его вместо выдумывания. */
export const QUESTIONS_NOT_FOUND = "QUESTIONS_NOT_FOUND";

const wordExtractor = new WordExtractor();

const TASK_RULES = typo(
  "Выпиши ВСЕ экзаменационные вопросы из документа, по одному в строке, без нумерации, маркеров и пояснений. Сохраняй формулировки дословно. Не выводи ничего, кроме списка вопросов. Если документ не похож на список экзаменационных вопросов — выведи ровно одну строку QUESTIONS_NOT_FOUND.",
);

function buildTextPrompt(documentText: string): string {
  return [TASK_RULES, "", typo("Документ:"), documentText.slice(0, MAX_PROMPT_TEXT_CHARS)].join("\n");
}

function buildPdfPrompt(fileName: string): string {
  return [
    typo(`В текущей папке лежит файл ./${fileName} — прочитай его целиком (Read умеет читать PDF, большие — частями).`),
    "",
    TASK_RULES,
  ].join("\n");
}

// Ответ модели → список вопросов: остаточная нумерация и маркеры срезаются (как в textarea).
const LINE_PREFIX = /^\s*(?:\d+\s*[.)]\s*|[•*–—-]\s+)/;

function parseReply(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(LINE_PREFIX, "").trim())
    .filter(Boolean);
}

export interface UploadedQuestionFile {
  fileName: string;
  buffer: Buffer;
}

/**
 * Извлекает список вопросов из файла живым sonnet. Бросает Error с QUESTIONS_NOT_FOUND,
 * если документ не похож на список вопросов; прочие ошибки — технические (текст по-русски).
 */
export async function parseQuestionsFromFile(file: UploadedQuestionFile): Promise<string[]> {
  const extension = path.extname(file.fileName).toLowerCase();
  const workDir = await mkdtemp(path.join(tmpdir(), "question-parse-"));
  try {
    let reply: string;
    if (extension === ".pdf") {
      // PDF отдаём клоду как файл: Read умеет читать его постранично, cwd — временная папка.
      await writeFile(path.join(workDir, "questions.pdf"), file.buffer);
      reply = await runModelPrompt(buildPdfPrompt("questions.pdf"), {
        model: PARSE_MODEL,
        timeoutMs: PARSE_TIMEOUT_MS,
        readDir: workDir,
      });
    } else {
      const text =
        extension === ".doc" || extension === ".docx"
          ? (await wordExtractor.extract(file.buffer)).getBody()
          : file.buffer.toString("utf8");
      if (!text.trim()) throw new Error(typo("Файл пустой — вопросов в нём нет"));
      reply = await runModelPrompt(buildTextPrompt(text), { model: PARSE_MODEL, timeoutMs: PARSE_TIMEOUT_MS });
    }

    if (reply.includes(QUESTIONS_NOT_FOUND)) throw new Error(QUESTIONS_NOT_FOUND);
    const questions = parseReply(reply);
    if (!questions.length) throw new Error(QUESTIONS_NOT_FOUND);
    return questions;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
