import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseGeneratedDeck, typo } from "~/lib";

import { db } from "./db";

export interface GenerationFile {
  field: "materials" | "questions";
  name: string;
  bytes: Buffer;
}

export interface GenerationInput {
  materialsText: string;
  questionsText: string;
  files: GenerationFile[];
}

const JOBS_ROOT = path.join(process.cwd(), "data", "jobs");
const CLAUDE_MODEL = "opus";
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// Промпт для claude -p: он сам читает ./inputs и пишет ./output.json. Обёрнут в typo() по правилу проекта.
const GENERATION_PROMPT = typo(`Ты готовишь карточки для подготовки к экзамену. В папке ./inputs/ лежат входные данные пользователя:
- материалы и конспекты (имена файлов начинаются с «materials»);
- вопросы к экзамену (имена файлов начинаются с «questions») — их может и не быть.

Сначала изучи всё в ./inputs/: выполни «ls -la inputs», затем полностью прочитай каждый файл (инструмент Read; файлы могут быть большими — при необходимости читай частями).

Затем составь карточки по правилам:
1. Если есть вопросы — используй именно их. Если у вопросов уже есть ответы, выверь и при необходимости улучши их; если ответов нет — составь сам.
2. Если вопросов нет — придумай 50 потенциальных экзаменационных вопросов строго по материалам.
3. Если есть материалы — отвечай строго по ним (это первоисточник). Если материалов нет — отвечай по своим знаниям предмета.
4. Для каждой карточки сделай ДВА ответа:
   - «answerShort»: краткий ответ для самопроверки, обычный текст, 1–2 абзаца, без markdown;
   - «answerDeep»: глубокое изучение темы, 4–5 абзацев с примерами, оформленный в markdown (заголовки, списки, выделения, при необходимости блоки кода).
5. Язык карточек — русский (или язык исходных материалов).

Результат запиши строго как валидный JSON в файл ./output.json (инструмент Write), без каких-либо пояснений вокруг, по схеме:

{
  "title": "Короткое название колоды по теме",
  "description": "Однострочное описание (необязательно)",
  "cards": [
    { "question": "...", "answerShort": "...", "answerDeep": "..." }
  ]
}

Не выводи ничего в ответ — просто создай файл ./output.json. Не выходи за пределы текущей папки.`);

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned || "file";
}

// Запуск claude -p в папке задания: читает ./inputs, пишет ./output.json. Возвращает содержимое output.json.
function runClaude(jobDir: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", GENERATION_PROMPT, "--model", CLAUDE_MODEL, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Edit,Bash"],
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
      readFile(path.join(jobDir, "output.json"), "utf8").then(
        (content) => {
          resolve(content);
        },
        () => {
          reject(new Error(typo("Claude не создал результат. Проверьте материалы и вход в аккаунт Claude в контейнере.")));
        },
      );
    });
  });
}

async function runGenerationJob(deckId: string, input: GenerationInput): Promise<void> {
  const jobDir = path.join(JOBS_ROOT, deckId);
  const inputsDir = path.join(jobDir, "inputs");
  try {
    await mkdir(inputsDir, { recursive: true });
    if (input.materialsText.trim()) await writeFile(path.join(inputsDir, "materials.md"), input.materialsText, "utf8");
    if (input.questionsText.trim()) await writeFile(path.join(inputsDir, "questions.md"), input.questionsText, "utf8");
    for (const [index, file] of input.files.entries()) {
      await writeFile(path.join(inputsDir, `${file.field}_${index}_${safeName(file.name)}`), file.bytes);
    }

    const output = await runClaude(jobDir);
    const result = parseGeneratedDeck(output);

    await db.$transaction([
      db.deck.update({
        where: { id: deckId },
        data: { title: result.title, description: result.description ?? null, status: "ready", generationError: null },
      }),
      db.card.createMany({
        data: result.cards.map((card, index) => ({
          deckId,
          question: card.question,
          answer: card.answerShort,
          answerDeep: card.answerDeep,
          position: index,
        })),
      }),
    ]);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Неизвестная ошибка генерации");
    await db.deck
      .update({ where: { id: deckId }, data: { status: "failed", generationError: message.slice(0, 500) } })
      .catch(() => undefined);
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// Очередь: один claude за раз (Opus ресурсоёмкий). runGenerationJob сам не бросает — цепочка живёт.
let queueTail: Promise<void> = Promise.resolve();

export function enqueueGeneration(deckId: string, input: GenerationInput): void {
  queueTail = queueTail.then(() => runGenerationJob(deckId, input));
}
