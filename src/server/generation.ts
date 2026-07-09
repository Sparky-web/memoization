import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import WordExtractor from "word-extractor";

import type { GeneratedFillTask, GeneratedQuizTask } from "~/lib";
import { parseGeneratedDeck, parseGeneratedExercises, typo } from "~/lib";

import { db } from "./db";
import { refundUsage } from "./usage";

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
  "title": "Короткое название колоды по теме",
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

// Промпт прохода «вставь слово»: claude читает ./inputs, пишет ./fill.json.
const FILL_PROMPT =
  typo(`Ты делаешь тренажёр «вставь пропущенное слово» для подготовки к экзамену. В папке ./inputs/ лежат материалы (конспекты, вопросы или карточки колоды).

Сначала изучи всё в ./inputs/: выполни «ls -la inputs», затем полностью прочитай каждый файл (инструмент Read; большие файлы читай частями).

Составь от 100 до 150 заданий «вставь слово» строго по этим материалам:
1. Каждое задание — короткое предложение или определение из материала, в котором ПРОПУЩЕНО одно ключевое слово или термин. Место пропуска обозначь РОВНО тремя подчёркиваниями: ___ (ровно один пропуск на задание).
2. «answer» — пропущенное слово или короткая фраза (1–3 слова).
3. «distractors» — ровно 3 правдоподобных, но НЕВЕРНЫХ варианта того же рода и формы (чтобы выбор был неочевиден). Правильный ответ среди них не повторяй.
4. По контексту предложения должно быть однозначно понятно, какое слово вставлять.
5. В поле «prompt» не используй markdown — обычный текст. Математику, если нужна, оформляй формулами LaTeX между одиночными $...$.
6. Язык — русский (или язык исходных материалов). Не повторяй одинаковые задания.

Результат запиши строго как валидный JSON в файл ./fill.json (инструмент Write), без каких-либо пояснений вокруг, по схеме:

{
  "fillTasks": [
    { "prompt": "Второй закон Ньютона: сила равна произведению массы на ___.", "answer": "ускорение", "distractors": ["скорость", "импульс", "энергию"] }
  ]
}

Не выводи ничего в ответ — просто создай файл ./fill.json. Не выходи за пределы текущей папки.`);

// Промпт прохода «тесты»: claude читает ./inputs, пишет ./quiz.json.
const QUIZ_PROMPT =
  typo(`Ты делаешь тест с вариантами ответа для подготовки к экзамену. В папке ./inputs/ лежат материалы (конспекты, вопросы или карточки колоды).

Сначала изучи всё в ./inputs/: выполни «ls -la inputs», затем полностью прочитай каждый файл (инструмент Read; большие файлы читай частями).

Составь от 100 до 150 тестовых вопросов строго по этим материалам:
1. Каждый вопрос — «question» с ровно 4 вариантами в «options».
2. Ровно ОДИН вариант правильный; его индекс (0, 1, 2 или 3; 0 — первый вариант) укажи в «correctIndex».
3. Неверные варианты — правдоподобные, по той же теме, без явных подсказок длиной или формулировкой. Не используй «все перечисленные» / «ни один из вариантов».
4. «explanation» — короткое пояснение, почему верен правильный вариант (1–2 предложения).
5. Математику оформляй формулами LaTeX (между одиночными $...$). Язык — русский (или язык исходных материалов). Не повторяй одинаковые вопросы.

Результат запиши строго как валидный JSON в файл ./quiz.json (инструмент Write), без каких-либо пояснений вокруг, по схеме:

{
  "quizTasks": [
    { "question": "В каких единицах измеряется сила?", "options": ["Ньютон", "Джоуль", "Ватт", "Паскаль"], "correctIndex": 0, "explanation": "Ньютон — единица силы в СИ." }
  ]
}

Не выводи ничего в ответ — просто создай файл ./quiz.json. Не выходи за пределы текущей папки.`);

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned || "file";
}

// Записывает сгенерированные задания/тесты, заменяя прошлые (перегенерация — идемпотентна).
// Тесты с битым correctIndex отбрасываем, остальное сохраняем (частичный успех важнее «всё или ничего»).
async function writeExercisesToDb(
  deckId: string,
  fillTasks: GeneratedFillTask[],
  quizTasks: GeneratedQuizTask[],
): Promise<void> {
  const validQuiz = quizTasks.filter((task) => task.correctIndex < task.options.length);
  await db.$transaction([
    db.fillTask.deleteMany({ where: { deckId } }),
    db.quizTask.deleteMany({ where: { deckId } }),
    db.fillTask.createMany({
      data: fillTasks.map((task, index) => ({
        deckId,
        prompt: task.prompt,
        answer: task.answer,
        // Не более 3 дистракторов (на режим выбора нужно 4 варианта = ответ + 3).
        distractors: task.distractors.slice(0, 3),
        position: index,
      })),
    }),
    db.quizTask.createMany({
      data: validQuiz.map((task, index) => ({
        deckId,
        question: task.question,
        options: task.options,
        correctIndex: task.correctIndex,
        explanation: task.explanation ?? null,
        position: index,
      })),
    }),
  ]);
}

// Два независимых прохода claude (fill.json, quiz.json) поверх готового ./inputs.
// Каждый проход изолирован: падение одного не теряет результат другого.
async function runExercisesPasses(deckId: string, jobDir: string): Promise<void> {
  try {
    let fillTasks: GeneratedFillTask[] = [];
    let quizTasks: GeneratedQuizTask[] = [];

    try {
      fillTasks = parseGeneratedExercises(await runClaude(jobDir, FILL_PROMPT, "fill.json")).fillTasks;
    } catch (error) {
      console.error("fill pass:", error);
    }
    try {
      quizTasks = parseGeneratedExercises(await runClaude(jobDir, QUIZ_PROMPT, "quiz.json")).quizTasks;
    } catch (error) {
      console.error("quiz pass:", error);
    }

    await writeExercisesToDb(deckId, fillTasks, quizTasks);

    const hasAny = fillTasks.length || quizTasks.length;
    await db.deck.update({
      where: { id: deckId },
      data: hasAny
        ? { exercisesStatus: "ready", exercisesError: null }
        : { exercisesStatus: "failed", exercisesError: typo("Не удалось сгенерировать задания и тесты") },
    });
    // Неудача не сжигает списанную попытку — возвращаем её (ручная генерация). У инлайновых
    // проходов при создании колоды события exercise_generation нет — удалять нечего.
    if (!hasAny) await refundUsage(db, "exercise_generation", [deckId]).catch(() => undefined);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Ошибка генерации заданий");
    await db.deck
      .update({ where: { id: deckId }, data: { exercisesStatus: "failed", exercisesError: message.slice(0, 500) } })
      .catch(() => undefined);
    await refundUsage(db, "exercise_generation", [deckId]).catch(() => undefined);
  }
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

// Пожелания пользователя сохраняем рядом с inputs — «Повторить генерацию» использует их снова.
const INSTRUCTIONS_FILE = "instructions.txt";

async function readSavedInstructions(jobDir: string): Promise<string> {
  try {
    return await readFile(path.join(jobDir, INSTRUCTIONS_FILE), "utf8");
  } catch {
    return "";
  }
}

// input === null — ретрай: материалы уже лежат в каталоге задания с прошлой (неудавшейся) попытки.
async function runGenerationJob(deckId: string, input: GenerationInput | null): Promise<void> {
  const jobDir = path.join(JOBS_ROOT, deckId);
  const inputsDir = path.join(jobDir, "inputs");
  try {
    let instructions: string;
    if (input) {
      // Первый запуск — чистый каталог, чтобы не подмешать остатки прошлых заданий.
      await rm(jobDir, { recursive: true, force: true });
      await writeJobInputs(inputsDir, input);
      instructions = input.instructions;
      if (instructions.trim()) await writeFile(path.join(jobDir, INSTRUCTIONS_FILE), instructions, "utf8");
    } else {
      // Ретрай: прошлый output.json (возможно, битый) не должен сойти за свежий результат.
      await rm(path.join(jobDir, "output.json"), { force: true });
      instructions = await readSavedInstructions(jobDir);
    }

    const output = await runClaude(jobDir, buildPrompt(instructions), "output.json");
    const result = parseGeneratedDeck(output);

    await db.$transaction([
      db.deck.update({
        where: { id: deckId },
        data: {
          title: result.title,
          description: result.description ?? null,
          status: "ready",
          generationError: null,
          // Карточки готовы — сразу запускаем генерацию заданий/тестов следующим шагом.
          exercisesStatus: "processing",
        },
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

    // Карточки уже сохранены (колода готова) — задания/тесты генерируем поверх тех же ./inputs.
    // Свои ошибки этот шаг не пробрасывает: неудача заданий не делает колоду failed.
    await runExercisesPasses(deckId, jobDir);

    // Каталог задания удаляем только при успехе.
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Неизвестная ошибка генерации");
    await db.deck
      .update({ where: { id: deckId }, data: { status: "failed", generationError: message.slice(0, 500) } })
      .catch(() => undefined);
    // Неудачная генерация не списывает лимит: возвращаем попытку (ретрай новую не списывает).
    await refundUsage(db, "deck_generation", [deckId]).catch(() => undefined);
    // При ошибке inputs сознательно оставляем на диске — из них работает «Повторить генерацию».
  }
}

// Догенерация заданий/тестов для уже готовой колоды (ручной запуск или старый/импортированный
// набор). Источник — сами карточки колоды (исходных материалов уже нет).
async function runDeckExercisesJob(deckId: string): Promise<void> {
  const jobDir = path.join(JOBS_ROOT, `${deckId}-exercises`);
  const inputsDir = path.join(jobDir, "inputs");
  try {
    const cards = await db.card.findMany({
      where: { deckId },
      orderBy: { position: "asc" },
      select: { question: true, answer: true },
    });
    if (!cards.length) {
      await db.deck.update({
        where: { id: deckId },
        data: { exercisesStatus: "failed", exercisesError: typo("В колоде нет карточек для генерации заданий") },
      });
      await refundUsage(db, "exercise_generation", [deckId]).catch(() => undefined);
      return;
    }

    await mkdir(inputsDir, { recursive: true });
    const source = cards.map((card, index) => `${index + 1}. ${card.question}\n${card.answer}`).join("\n\n");
    await writeFile(path.join(inputsDir, "materials.md"), source, "utf8");

    await runExercisesPasses(deckId, jobDir);
  } catch (error) {
    // Сюда попадают только сбои подготовки входных данных: свои провалы runExercisesPasses
    // обрабатывает (и рефандит) сам, наружу не пробрасывает — двойного возврата не будет.
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Ошибка генерации заданий");
    await db.deck
      .update({ where: { id: deckId }, data: { exercisesStatus: "failed", exercisesError: message.slice(0, 500) } })
      .catch(() => undefined);
    await refundUsage(db, "exercise_generation", [deckId]).catch(() => undefined);
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
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

export function enqueueGeneration(deckId: string, input: GenerationInput): void {
  enqueueJob(deckId, () => runGenerationJob(deckId, input));
}

/** Повторный запуск генерации по материалам, оставшимся на диске после неудачной попытки. */
export function enqueueGenerationRetry(deckId: string): void {
  enqueueJob(deckId, () => runGenerationJob(deckId, null));
}

export function enqueueDeckExercises(deckId: string): void {
  enqueueJob(`${deckId}:exercises`, () => runDeckExercisesJob(deckId));
}

/** Позиция генерации колоды в очереди: 0 — выполняется сейчас, null — в очереди нет. */
export function getGenerationQueuePosition(deckId: string): number | null {
  const index = queuedJobKeys.indexOf(deckId);
  return index >= 0 ? index : null;
}

/** Удаляет каталог задания с диска — материалы неудачной генерации больше не нужны (колода удалена). */
export function cleanupGenerationJob(deckId: string): void {
  void rm(path.join(JOBS_ROOT, deckId), { recursive: true, force: true }).catch(() => undefined);
}

/** Сохранились ли на диске входные материалы колоды (нужны для «Повторить генерацию»). */
export async function generationInputsExist(deckId: string): Promise<boolean> {
  try {
    const entries = await readdir(path.join(JOBS_ROOT, deckId, "inputs"));
    return entries.length > 0;
  } catch {
    return false;
  }
}
