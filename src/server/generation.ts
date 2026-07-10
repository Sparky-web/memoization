import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import WordExtractor from "word-extractor";

import {
  type GeneratedAnswer,
  type GeneratedCard,
  type GeneratedFullAnswer,
  parseGeneratedAnswers,
  parseGeneratedCardList,
  parseGeneratedCards,
  parseGeneratedFullAnswers,
  typo,
} from "~/lib";

import { db } from "./db";
import { materialAbsolutePath } from "./materialStorage";
import { refundUsage } from "./usage";

// Очередь ИИ-генерации экзаменов: один claude за раз, статусы на Exam.status.
// Двухпроходный пайплайн (docs/domashnik.md, раздел 4): проход A «Ответы и темы» →
// answers.json, проход B «Карточки» → cards.json, затем транзакционная запись в БД.

const JOBS_ROOT = path.join(process.cwd(), "data", "jobs");
const GENERATION_MODEL = "opus";
// Точечная перегенерация карточек одного вопроса — задача маленькая, sonnet дешевле и быстрее.
const REGENERATION_MODEL = "sonnet";
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const REGENERATION_TIMEOUT_MS = 5 * 60 * 1000;

// Word (.doc/.docx) claude напрямую не читает — извлекаем текст на сервере.
const wordExtractor = new WordExtractor();

const MATH_RULES = typo(
  `Математику оформляй формулами LaTeX (KaTeX): формула внутри строки — между одиночными «$» ($E=mc^2$), отдельная блочная формула — между «$$», причём «$$» на ОТДЕЛЬНЫХ строках. Не дублируй формулу обычным текстом. Сравнения, классификации и структурированные перечисления оформляй markdown-таблицами, где это уместно.`,
);

const CARD_FORMAT_RULES = typo(`Форматы карточек:
- "open" — базовый: вопрос → краткий верный ответ (answer), options — пустой массив;
- "cloze" — утверждение с пропуском КЛЮЧЕВОГО слова: в prompt вместо него стоит «___» (ровно три подчёркивания обычным текстом, НЕ внутри LaTeX-формулы и БЕЗ экранирования), answer — пропущенное слово или короткая фраза, options — пустой массив;
- "mcq" — тест: ровно 4 варианта в options, answer ДОСЛОВНО совпадает с одним из них; дистракторы делай ПРАВДОПОДОБНЫМИ — предпочтительно бери правильные ответы на СОСЕДНИЕ вопросы этого же экзамена (хитрые отвлечения);
- "truefalse" — немного, только для разминки: prompt — утверждение, answer — строго "true" или "false", options — пустой массив.
У каждой карточки обязательно explanation — однострочное «почему это так».`);

// Обязательная первая карточка каждого вопроса — «полный вопрос»: тренировка ответа
// на билет целиком, а не только на атомарные факты (жалоба «в сессии только лёгкие вопросы»).
const FULL_CARD_RULE = typo(
  `ПЕРВАЯ карточка КАЖДОГО вопроса — обязательная карточка «полный вопрос»: kind="full", format="open", prompt — сам экзаменационный вопрос (как в билете, без перефразирования), answer — сжатый полный ответ на него (5–8 предложений или пунктов — достаточный для устного ответа на экзамене), explanation — ключевая структура ответа одной строкой. Остальные карточки — kind="atomic".`,
);

// Смещение пропорций форматов карточек по формату экзамена (спека, раздел 4).
const FORMAT_MIX_BY_EXAM: Record<string, string> = {
  oral: typo("Экзамен устный — большинство карточек делай open (объяснение своими словами), mcq — немного."),
  written: typo("Экзамен письменный — упор на open и cloze (точные формулировки), mcq — немного."),
  test: typo("Экзамен в формате теста — большинство карточек делай mcq, остальное open и cloze."),
};

const DEFAULT_FORMAT_MIX = typo(
  "Формат экзамена не указан — сбалансированный микс: примерно половина open, остальное cloze и mcq, немного truefalse.",
);

// Проход A: ответы на каждый вопрос (из материалов с цитатой, иначе из общих знаний) + темы.
function buildAnswersPrompt(hasMaterials: boolean, questionCount: number): string {
  const materialsRules = hasMaterials
    ? typo(`В папке ./inputs/materials/ — конспекты и материалы пользователя (txt/md/pdf; Read умеет читать PDF).
Для КАЖДОГО вопроса сначала ищи ответ в материалах: Grep по ключевым словам, Read нужных файлов (большие файлы читай частями). Нашёл ответ в материалах — пиши answerMd СТРОГО по ним и ставь covered=true, aiGenerated=false, sourceRef в формате «имя-файла: короткая точная цитата из этого файла не длиннее 120 символов». Не нашёл — ставь covered=false, aiGenerated=true, sourceRef=null и отвечай из общих знаний предмета.`)
    : typo(
        "Материалов пользователя нет: отвечай из общих знаний предмета, у всех вопросов ставь covered=true, aiGenerated=true, sourceRef=null.",
      );

  return `${typo(`Ты готовишь развёрнутые ответы на вопросы к экзамену.
В файле ./inputs/questions.txt — нумерованный список из ${questionCount} вопросов (формат «номер. текст»). Прочитай его целиком (Read).`)}

${materialsRules}

${typo(
  "answerMd — полный ответ на вопрос в markdown (заголовки, списки, выделения по необходимости), достаточный, чтобы подготовиться по нему к экзамену. Язык — русский (или язык вопросов).",
)} ${MATH_RULES}

${typo(
  "Дополнительно сгруппируй вопросы в 4–8 тем: topic — короткое название темы (1–3 слова); у вопросов одного кластера строка topic должна совпадать буква в букву.",
)}

${typo("Результат запиши строго как валидный JSON-массив в файл ./answers.json (Write), без пояснений вокруг:")}
[
  { "position": 1, "topic": "…", "answerMd": "…", "covered": true, "aiGenerated": false, "sourceRef": "konspekt.pdf: «…»" }
]
${typo(
  `Каждый вопрос — ровно один раз; position — его номер из questions.txt (от 1 до ${questionCount}). Не выводи ничего в ответ и не выходи за пределы текущей папки.`,
)}`;
}

// Проход B: дробление ответов на атомарные карточки с миксом форматов.
function buildCardsPrompt(examFormat: string | null, questionCount: number): string {
  const formatMix = (examFormat ? FORMAT_MIX_BY_EXAM[examFormat] : null) ?? DEFAULT_FORMAT_MIX;

  return `${typo(`Ты дробишь ответы на экзаменационные вопросы на атомарные карточки для интервального повторения.
В ./inputs/questions.txt — нумерованный список из ${questionCount} вопросов, в ./answers.json — готовые ответы на них (поля position, topic, answerMd, covered, aiGenerated, sourceRef). Прочитай оба файла целиком (Read).`)}

${FULL_CARD_RULE}

${typo("ПЛЮС к карточке «полный вопрос» составь на каждый вопрос 2–4 атомарные карточки: один факт — одна карточка.")}

${CARD_FORMAT_RULES}

${formatMix}

${typo("Язык карточек — как у ответов.")} ${MATH_RULES}

${typo("Результат запиши строго как валидный JSON-массив в файл ./cards.json (Write), без пояснений вокруг:")}
[
  { "position": 1, "cards": [ { "format": "open", "kind": "full", "prompt": "…", "answer": "…", "options": [], "explanation": "…" }, { "format": "cloze", "kind": "atomic", "prompt": "…", "answer": "…", "options": [], "explanation": "…" } ] }
]
${typo(
  `Каждый вопрос — ровно один раз (position от 1 до ${questionCount}), у каждого первая карточка — «полный вопрос» и ещё 2–4 атомарные. Не выводи ничего в ответ и не выходи за пределы текущей папки.`,
)}`;
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
        GENERATION_MODEL,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Read,Write,Edit,Bash,Grep,Glob",
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

interface JobQuestion {
  id: string;
  text: string;
}

interface JobMaterial {
  fileName: string;
  storagePath: string;
}

// Раскладывает вход задания: questions.txt + копии материалов (Word — извлечённым текстом).
async function writeJobInputs(inputsDir: string, questions: JobQuestion[], materials: JobMaterial[]): Promise<void> {
  await mkdir(inputsDir, { recursive: true });
  const questionsText = questions.map((question, index) => `${index + 1}. ${question.text}`).join("\n");
  await writeFile(path.join(inputsDir, "questions.txt"), questionsText, "utf8");

  if (!materials.length) return;
  const materialsDir = path.join(inputsDir, "materials");
  await mkdir(materialsDir, { recursive: true });
  for (const material of materials) {
    const sourcePath = materialAbsolutePath(material.storagePath);
    const baseName = path.basename(material.storagePath);
    const lower = material.fileName.toLowerCase();
    try {
      if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
        const document = await wordExtractor.extract(sourcePath);
        await writeFile(path.join(materialsDir, `${baseName}.txt`), document.getBody(), "utf8");
        continue;
      }
      await copyFile(sourcePath, path.join(materialsDir, baseName));
    } catch (error) {
      // Потерянный/битый файл материала не должен валить всю генерацию — остальные материалы важнее.
      console.error("material input failed:", material.storagePath, error);
    }
  }
}

// Транзакционная запись результата: ответы в Question по позиции, старые ИИ-карточки — под замену.
async function persistGenerationResult(
  examId: string,
  questions: JobQuestion[],
  answers: GeneratedAnswer[],
  questionCards: { position: number; cards: GeneratedCard[] }[],
): Promise<void> {
  const answerByPosition = new Map(answers.map((answer) => [answer.position, answer]));
  await db.$transaction(
    async (tx) => {
      for (const [index, question] of questions.entries()) {
        const answer = answerByPosition.get(index + 1);
        if (!answer) continue;
        await tx.question.update({
          where: { id: question.id },
          data: {
            topic: answer.topic,
            answerMd: answer.answerMd,
            covered: answer.covered,
            aiGenerated: answer.aiGenerated,
            sourceRef: answer.sourceRef,
          },
        });
      }

      // Полная перегенерация: удаляем карточки прошлых генераций (помечены aiGenerated
      // или привязаны к вопросу); ручные (addCard: без вопроса и без пометки) остаются.
      await tx.card.deleteMany({
        where: { examId, OR: [{ aiGenerated: true }, { questionId: { not: null } }] },
      });

      const lastManualCard = await tx.card.findFirst({
        where: { examId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      let cardPosition = (lastManualCard?.position ?? -1) + 1;

      const cardRows = [];
      for (const entry of questionCards) {
        const question = questions[entry.position - 1];
        const answer = answerByPosition.get(entry.position);
        if (!question || !answer) continue;
        for (const card of entry.cards) {
          cardRows.push({
            examId,
            questionId: question.id,
            format: card.format,
            kind: card.kind,
            prompt: card.prompt,
            answer: card.answer,
            options: card.options,
            explanation: card.explanation,
            // «Полный вопрос» несёт полный ответ прохода A развёрнутым разбором.
            deepMd: card.kind === "full" ? answer.answerMd : null,
            // Привязка к источнику наследуется от ответа на вопрос (проход A).
            sourceRef: answer.sourceRef,
            aiGenerated: answer.aiGenerated,
            position: cardPosition,
          });
          cardPosition += 1;
        }
      }
      await tx.card.createMany({ data: cardRows });

      await tx.exam.update({ where: { id: examId }, data: { status: "ready", generationError: null } });
    },
    // Экзамен на 300 вопросов — до ~1500 карточек: дефолтных 5 секунд транзакции может не хватить.
    { timeout: 60_000, maxWait: 10_000 },
  );
}

async function runGenerationJob(examId: string): Promise<void> {
  const jobDir = path.join(JOBS_ROOT, examId);
  const inputsDir = path.join(jobDir, "inputs");
  try {
    const exam = await db.exam.findUnique({ where: { id: examId }, select: { examFormat: true } });
    const questions = await db.question.findMany({
      where: { examId },
      orderBy: { position: "asc" },
      select: { id: true, text: true },
    });
    if (!exam || !questions.length) {
      throw new Error(typo("У экзамена нет вопросов — добавьте их и запустите генерацию заново."));
    }
    const materials = await db.material.findMany({
      where: { examId },
      orderBy: { createdAt: "asc" },
      select: { fileName: true, storagePath: true },
    });

    // Чистый каталог, чтобы не подмешать остатки прошлых заданий.
    await rm(jobDir, { recursive: true, force: true });
    await writeJobInputs(inputsDir, questions, materials);

    const answersRaw = await runClaude(
      jobDir,
      buildAnswersPrompt(materials.length > 0, questions.length),
      "answers.json",
    );
    const answers = parseGeneratedAnswers(answersRaw, questions.length);

    const cardsRaw = await runClaude(jobDir, buildCardsPrompt(exam.examFormat, questions.length), "cards.json");
    const questionCards = parseGeneratedCards(cardsRaw, questions.length);

    await persistGenerationResult(examId, questions, answers, questionCards);

    // Каталог задания удаляем только при успехе — при ошибке он полезен для разбора.
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : typo("Неизвестная ошибка генерации");
    await db.exam
      .update({ where: { id: examId }, data: { status: "failed", generationError: message.slice(0, 500) } })
      .catch(() => undefined);
    // Неудачная генерация не списывает лимит: возвращаем попытку (refId события = examId).
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

/** Ставит экзамен в очередь генерации; вход (вопросы, материалы) джоба читает из БД сама. */
export function enqueueGeneration(examId: string): void {
  enqueueJob(examId, () => runGenerationJob(examId));
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

// --- Точечная перегенерация карточек одного вопроса (без очереди и без списания квоты) ---

export interface RegenerationQuestion {
  text: string;
  topic: string | null;
  answerMd: string;
  examFormat: string | null;
  /** Соседние вопросы с их ответами — источник правдоподобных дистракторов mcq. */
  neighbors: { text: string; answerMd: string | null }[];
}

function buildQuestionCardsPrompt(question: RegenerationQuestion): string {
  const formatMix = (question.examFormat ? FORMAT_MIX_BY_EXAM[question.examFormat] : null) ?? DEFAULT_FORMAT_MIX;
  const neighborsBlock = question.neighbors.length
    ? `${typo("Соседние вопросы этого экзамена (их ответы — материал для правдоподобных дистракторов mcq):")}\n${question.neighbors
        .map((neighbor) => `- ${neighbor.text}${neighbor.answerMd ? ` — ${neighbor.answerMd.slice(0, 200)}` : ""}`)
        .join("\n")}`
    : "";

  const parts = [
    typo(
      "Ты пересобираешь карточки интервального повторения для ОДНОГО экзаменационного вопроса. Составь карточку «полный вопрос» и 2–4 атомарные: один факт — одна карточка.",
    ),
    "",
    `${typo("Вопрос")}: ${question.text}`,
    question.topic ? `${typo("Тема")}: ${question.topic}` : "",
    `${typo("Ответ (markdown)")}:\n${question.answerMd}`,
    "",
    neighborsBlock,
    "",
    FULL_CARD_RULE,
    CARD_FORMAT_RULES,
    formatMix,
    `${typo("Язык карточек — как у ответа.")} ${MATH_RULES}`,
    "",
    typo("Выведи в ответ ТОЛЬКО валидный JSON-массив карточек, без пояснений и без markdown-ограждений:"),
    `[ { "format": "open", "kind": "full", "prompt": "…", "answer": "…", "options": [], "explanation": "…" }, { "format": "cloze", "kind": "atomic", "prompt": "…", "answer": "…", "options": [], "explanation": "…" } ]`,
  ];
  return parts.filter(Boolean).join("\n");
}

// Запуск claude -p без инструментов (ответ в stdout): маленькая задача, ФС ей не нужна.
function runClaudeText(prompt: string, timeoutMs: number = REGENERATION_TIMEOUT_MS): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt, "--model", REGENERATION_MODEL, "--tools", ""], {
      cwd: tmpdir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(typo("Превышено время перегенерации карточек.")));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (stderr.trim()) console.error("claude regenerate stderr:", stderr.slice(0, 500));
      const text = stdout.trim();
      if (!text) {
        reject(new Error(typo("Пустой ответ от Claude.")));
        return;
      }
      resolve(text);
    });
  });
}

/** Генерирует новый набор карточек для одного вопроса (sonnet); валидация — та же схема, что в проходе B. */
export async function generateQuestionCards(question: RegenerationQuestion): Promise<GeneratedCard[]> {
  const raw = await runClaudeText(buildQuestionCardsPrompt(question));
  return parseGeneratedCardList(raw);
}

// --- Бэкфилл «полных вопросов» для существующих экзаменов: один батч-вызов sonnet ---

// Батч заметно больше точечной перегенерации (до сотен сжатых ответов) — таймаут шире.
const FULL_BACKFILL_TIMEOUT_MS = 15 * 60 * 1000;
// Полный ответ вопроса режем в промпте: модель пишет сжатый ответ, целиком ей текст не нужен.
const FULL_BACKFILL_ANSWER_SLICE = 4000;

export interface FullBackfillQuestion {
  text: string;
  answerMd: string;
}

function buildFullAnswersPrompt(questions: readonly FullBackfillQuestion[]): string {
  const questionsBlock = questions
    .map(
      (question, index) =>
        `${index + 1}. ${typo("Вопрос")}: ${question.text}\n${typo("Полный ответ (markdown)")}:\n${question.answerMd.slice(0, FULL_BACKFILL_ANSWER_SLICE)}`,
    )
    .join("\n\n---\n\n");

  return [
    typo(
      `Ты готовишь карточки «полный вопрос» для интервального повторения: по полному ответу на каждый экзаменационный вопрос составь сжатый полный ответ (5–8 предложений или пунктов — достаточный, чтобы устно ответить на билет) и explanation — ключевую структуру ответа одной строкой. Ничего не выдумывай сверх данного ответа.`,
    ),
    `${typo("Язык — как у ответов.")} ${MATH_RULES}`,
    "",
    typo(`Вопросы (${questions.length}):`),
    questionsBlock,
    "",
    typo("Выведи в ответ ТОЛЬКО валидный JSON-массив, без пояснений и без markdown-ограждений:"),
    `[ { "position": 1, "answer": "…", "explanation": "…" } ]`,
    typo(`Каждый вопрос — ровно один раз, position — его номер из списка выше (от 1 до ${questions.length}).`),
  ].join("\n");
}

/** Батч сжатых ответов «полных вопросов» (sonnet, один вызов на экзамен) — бэкфилл старых экзаменов. */
export async function generateFullQuestionAnswers(
  questions: readonly FullBackfillQuestion[],
): Promise<GeneratedFullAnswer[]> {
  const raw = await runClaudeText(buildFullAnswersPrompt(questions), FULL_BACKFILL_TIMEOUT_MS);
  return parseGeneratedFullAnswers(raw, questions.length);
}
