import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import WordExtractor from "word-extractor";

import { parseGeneratedDeck, typo } from "~/lib";

import { db } from "./db";
import { refundUsage } from "./usage";

// Очередь ИИ-генерации экзаменов: один claude за раз, статусы на Exam.status.
// Волна 2 заменит содержимое джобы на двухпроходный пайплайн (ответы → карточки, темы, цитаты);
// инфраструктура очереди/таймаутов/компенсаций сохраняется.

export interface GenerationFile {
  field: "materials" | "questions";
  name: string;
  bytes: Buffer;
}

export interface GenerationInput {
  materialsText: string;
  questionsText: string;
  /** Произвольные пожелания пользователя к стилю/форме ответов (может быть пустым). */
  instructions: string;
  files: GenerationFile[];
}

const JOBS_ROOT = path.join(process.cwd(), "data", "jobs");
const CLAUDE_MODEL = "opus";
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// Word (.doc/.docx) claude напрямую не читает — извлекаем текст на сервере.
const wordExtractor = new WordExtractor();

// Промпт для claude -p: он сам читает ./inputs и пишет ./output.json. Обёрнут в typo() по правилу проекта.
const GENERATION_PROMPT =
  typo(`Ты готовишь карточки для подготовки к экзамену. В папке ./inputs/ лежат входные данные пользователя:
- материалы и конспекты (имена файлов начинаются с «materials»);
- вопросы к экзамену (имена файлов начинаются с «questions») — их может и не быть.

Сначала изучи всё в ./inputs/: выполни «ls -la inputs», затем полностью прочитай каждый файл (инструмент Read; файлы могут быть большими — при необходимости читай частями).

Затем составь карточки по правилам:
1. Если есть вопросы — используй именно их. Если у вопросов уже есть ответы, выверь и при необходимости улучши их; если ответов нет — составь сам.
2. Если вопросов нет — придумай 50 потенциальных экзаменационных вопросов строго по материалам.
3. Если есть материалы — отвечай строго по ним (это первоисточник). Если материалов нет — отвечай по своим знаниям предмета.
4. Для каждой карточки сделай ДВА ответа:
   - «answerShort»: краткий ответ для самопроверки, 1–2 абзаца обычного текста; разделяй абзацы пустой строкой (двойным переводом строки); markdown-разметка не нужна;
   - «answerDeep»: глубокое изучение темы, 4–5 абзацев с примерами, оформленный в markdown (заголовки, списки, выделения, при необходимости блоки кода).
5. Математику в ЛЮБОМ из ответов (и кратком, и развёрнутом) оформляй формулами LaTeX. Формула внутри строки — между одиночными «$»: например, $E=mc^2$. Отдельная (блочная) формула — между «$$», причём «$$» обязательно на ОТДЕЛЬНЫХ строках:
$$
a^2 + b^2 = c^2
$$
Дроби, интегралы, суммы, индексы и прочее пиши стандартным синтаксисом LaTeX; не дублируй формулу обычным текстом.
6. Язык карточек — русский (или язык исходных материалов).

Результат запиши строго как валидный JSON в файл ./output.json (инструмент Write), без каких-либо пояснений вокруг, по схеме:

{
  "title": "Короткое название экзамена по теме",
  "description": "Однострочное описание (необязательно)",
  "cards": [
    { "question": "...", "answerShort": "...", "answerDeep": "..." }
  ]
}

Не выводи ничего в ответ — просто создай файл ./output.json. Не выходи за пределы текущей папки.`);

// Добавляем пожелания пользователя к стилю/форме ответов. Они приоритетнее стиля по умолчанию,
// но НЕ отменяют JSON-схему вывода и язык. Текст пользователя — динамический, typo() не нужен.
function buildPrompt(instructions: string): string {
  const trimmed = instructions.trim();
  if (!trimmed) return GENERATION_PROMPT;
  return `${GENERATION_PROMPT}\n\n${typo("Дополнительные пожелания пользователя к стилю и форме ответов — следуй им, но сохрани требуемую JSON-схему вывода и язык карточек:")}\n${trimmed}`;
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned || "file";
}

// Запуск claude -p в папке задания: читает ./inputs, пишет файл outFile. Возвращает его содержимое.
function runClaude(jobDir: string, prompt: string, outFile: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--model",
        CLAUDE_MODEL,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Read,Write,Edit,Bash",
      ],
      { cwd: jobDir, env: process.env, stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(typo("Превышено время генерации (30 минут).")));
    }, JOB_TIMEOUT_MS);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (stderr.trim()) console.error("claude stderr:", stderr.slice(0, 1000));
      readFile(path.join(jobDir, outFile), "utf8").then(
        (content) => {
          resolve(content);
        },
        () => {
          reject(
            new Error(typo("Claude не создал результат. Проверьте материалы и вход в аккаунт Claude в контейнере.")),
          );
        },
      );
    });
  });
}

// Раскладывает материалы пользователя в ./inputs задания (тексты + файлы; Word — извлечённым текстом).
async function writeJobInputs(inputsDir: string, input: GenerationInput): Promise<void> {
  await mkdir(inputsDir, { recursive: true });
  if (input.materialsText.trim()) await writeFile(path.join(inputsDir, "materials.md"), input.materialsText, "utf8");
  if (input.questionsText.trim()) await writeFile(path.join(inputsDir, "questions.md"), input.questionsText, "utf8");
  for (const [index, file] of input.files.entries()) {
    const base = `${file.field}_${index}_${safeName(file.name)}`;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
      try {
        const document = await wordExtractor.extract(file.bytes);
        await writeFile(path.join(inputsDir, `${base}.txt`), document.getBody(), "utf8");
        continue;
      } catch (error) {
        console.error("word extract failed:", error);
      }
    }
    await writeFile(path.join(inputsDir, base), file.bytes);
  }
}

async function runGenerationJob(examId: string, input: GenerationInput): Promise<void> {
  const jobDir = path.join(JOBS_ROOT, examId);
  const inputsDir = path.join(jobDir, "inputs");
  try {
    // Чистый каталог, чтобы не подмешать остатки прошлых заданий.
    await rm(jobDir, { recursive: true, force: true });
    await writeJobInputs(inputsDir, input);

    const output = await runClaude(jobDir, buildPrompt(input.instructions), "output.json");
    const result = parseGeneratedDeck(output);

    await db.$transaction([
      db.exam.update({
        where: { id: examId },
        data: {
          title: result.title,
          description: result.description ?? null,
          status: "ready",
          generationError: null,
        },
      }),
      db.card.createMany({
        data: result.cards.map((card, index) => ({
          examId,
          format: "open",
          prompt: card.question,
          answer: card.answerShort,
          deepMd: card.answerDeep,
          aiGenerated: true,
          position: index,
        })),
      }),
    ]);

    // Каталог задания удаляем только при успехе.
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Неизвестная ошибка генерации");
    await db.exam
      .update({ where: { id: examId }, data: { status: "failed", generationError: message.slice(0, 500) } })
      .catch(() => undefined);
    // Неудачная генерация не списывает лимит: возвращаем попытку.
    await refundUsage(db, "deck_generation", [examId]).catch(() => undefined);
  }
}

// Очередь: один claude за раз (Opus ресурсоёмкий). Задания сами не бросают — цепочка живёт.
// Ключи заданий держим в массиве в порядке постановки: голова — выполняющееся сейчас,
// индекс — позиция в очереди (для «В очереди: N-я» в интерфейсе).
let queueTail: Promise<void> = Promise.resolve();
const queuedJobKeys: string[] = [];

function enqueueJob(jobKey: string, run: () => Promise<void>): void {
  queuedJobKeys.push(jobKey);
  queueTail = queueTail.then(async () => {
    try {
      await run();
    } finally {
      const index = queuedJobKeys.indexOf(jobKey);
      if (index >= 0) queuedJobKeys.splice(index, 1);
    }
  });
}

export function enqueueGeneration(examId: string, input: GenerationInput): void {
  enqueueJob(examId, () => runGenerationJob(examId, input));
}

/** Позиция генерации экзамена в очереди: 0 — выполняется сейчас, null — в очереди нет. */
export function getGenerationQueuePosition(examId: string): number | null {
  const index = queuedJobKeys.indexOf(examId);
  return index >= 0 ? index : null;
}

/** Удаляет каталог задания с диска — материалы генерации больше не нужны (экзамен удалён). */
export function cleanupGenerationJob(examId: string): void {
  void rm(path.join(JOBS_ROOT, examId), { recursive: true, force: true }).catch(() => undefined);
}
