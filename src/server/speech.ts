import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { serverEnv } from "~/env.server";
import { typo, zodRussian } from "~/lib";

const execFileAsync = promisify(execFile);

// Голосовой слой «объясни ученику»: прокси к Яндекс SpeechKit (docs/domashnik.md, раздел 6).
// STT — REST v3 (recognizeFileAsync): синхронный v1 /speech/v1/recognize выведен из эксплуатации
// и отвечает 404 на всё (проверено живыми запросами в В7). TTS — v1, он жив.
// Ключи опциональны — без них роуты /api/speech/* отвечают 503, UI прячет голосовой режим.

const SPEECH_TIMEOUT_MS = 20_000;

/** Потолок аудио для распознавания: ~30 секунд opus — держит короткие реплики и наш трафик. */
export const MAX_STT_BYTES = 1024 * 1024;
/** Потолок текста на синтез: реплики ученика короткие, длиннее — обрезаем на клиенте. */
export const MAX_TTS_CHARS = 500;

// «Ученик» — мужской молодой голос. anton в v1 не поддерживается (живой ответ «Unsupported voice»),
// ermil поддерживает эмоцию good (доброжелательный тон) — проверено живым синтезом в В7.
const TTS_VOICE = "ermil";
const TTS_EMOTION = "good";

/** Заданы ли ключи SpeechKit — от этого зависят доступность роутов и видимость голосового UI. */
export function isSpeechConfigured(): boolean {
  return Boolean(serverEnv.YANDEX_SPEECHKIT_API_KEY && serverEnv.YANDEX_SPEECHKIT_FOLDER_ID);
}

function speechCredentials(): { apiKey: string; folderId: string } {
  const apiKey = serverEnv.YANDEX_SPEECHKIT_API_KEY;
  const folderId = serverEnv.YANDEX_SPEECHKIT_FOLDER_ID;
  if (!apiKey || !folderId) throw new Error(typo("SpeechKit не настроен"));
  return { apiKey, folderId };
}

// SpeechKit принимает opus только в ogg-контейнере — webm (Chrome) и mp4/AAC (Safari) он отвергает.
// Поэтому не-ogg контейнеры перепаковываем в ogg/opus на сервере: webm несёт ту же opus-дорожку
// (копирование без перекодирования), mp4 и прочее перекодируем. ffmpeg обязателен в рантайме
// (ставится в Dockerfile); без него распознавание для Chrome/Safari честно падает с ошибкой в логи.

/** Отступ таймаута ffmpeg от общего дедлайна — чтобы успеть отдать читаемую ошибку. */
const FFMPEG_TIMEOUT_MS = 10_000;

async function convertToOggOpus(audio: Buffer, mimeType: string): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "speech-stt-"));
  const inputPath = path.join(workDir, "input");
  try {
    await writeFile(inputPath, audio);
    // webm-opus → копия дорожки (без потерь и быстро); иные контейнеры (mp4/AAC) → перекодирование.
    const codecArgs = mimeType.includes("webm") ? ["-c:a", "copy"] : ["-c:a", "libopus", "-b:a", "64k"];
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", inputPath, "-vn", ...codecArgs, "-f", "ogg", "pipe:1"],
      { encoding: "buffer", timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 8 * MAX_STT_BYTES },
    );
    if (!stdout.length) throw new Error(typo("ffmpeg вернул пустой результат"));
    return stdout;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new Error(typo("На сервере нет ffmpeg — запись из этого браузера не переупаковать в ogg/opus"), {
        cause: error,
      });
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function normalizeSttAudio(audio: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType.includes("ogg")) return audio;
  return convertToOggOpus(audio, mimeType);
}

// REST v3 асинхронный: recognizeFileAsync → поллинг операции → getRecognition (NDJSON-строки).
// Короткая реплика (≤ 30 сек) распознаётся за единицы секунд — поллинг с секундным шагом.
const STT_POLL_INTERVAL_MS = 1000;
const STT_DEADLINE_MS = 25_000;

const sttOperationStartSchema = zodRussian.object({ id: zodRussian.string().min(1) });

const sttOperationStatusSchema = zodRussian.object({
  done: zodRussian.boolean(),
  error: zodRussian.object({ message: zodRussian.string().optional() }).nullable().optional(),
});

const sttRecognitionLineSchema = zodRussian.object({
  result: zodRussian.object({
    final: zodRussian
      .object({ alternatives: zodRussian.array(zodRussian.object({ text: zodRussian.string() })) })
      .optional(),
    finalRefinement: zodRussian
      .object({
        normalizedText: zodRussian.object({
          alternatives: zodRussian.array(zodRussian.object({ text: zodRussian.string() })),
        }),
      })
      .optional(),
  }),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readSpeechError(response: Response): Promise<string> {
  const details = await response.text().catch(() => "");
  return `${response.status} ${details.slice(0, 300)}`;
}

async function startRecognition(apiKey: string, audio: Buffer): Promise<string> {
  const response = await fetch("https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync", {
    method: "POST",
    headers: { Authorization: `Api-Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content: audio.toString("base64"),
      recognitionModel: {
        model: "general",
        audioFormat: { containerAudio: { containerAudioType: "OGG_OPUS" } },
        textNormalization: { textNormalization: "TEXT_NORMALIZATION_ENABLED" },
        languageRestriction: { restrictionType: "WHITELIST", languageCode: ["ru-RU"] },
      },
    }),
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(typo(`SpeechKit STT: ${await readSpeechError(response)}`));
  return sttOperationStartSchema.parse(await response.json()).id;
}

async function waitRecognitionDone(apiKey: string, operationId: string): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    const response = await fetch(`https://operation.api.cloud.yandex.net/operations/${operationId}`, {
      headers: { Authorization: `Api-Key ${apiKey}` },
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(typo(`SpeechKit STT (операция): ${await readSpeechError(response)}`));
    const operation = sttOperationStatusSchema.parse(await response.json());
    if (operation.done) {
      if (operation.error)
        throw new Error(typo(`SpeechKit STT: ${operation.error.message ?? "распознавание не удалось"}`));
      return;
    }
    if (Date.now() - startedAt > STT_DEADLINE_MS) {
      throw new Error(typo("SpeechKit STT: не дождались результата распознавания"));
    }
    await sleep(STT_POLL_INTERVAL_MS);
  }
}

// Итоговый текст: нормализованные finalRefinement-строки (пунктуация, регистр); если их нет —
// сырые final. Строки идут по фрагментам речи — склеиваем пробелом.
function extractRecognitionText(ndjson: string): string {
  const rawFinals: string[] = [];
  const refinedFinals: string[] = [];
  for (const line of ndjson.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(trimmedLine);
    } catch {
      continue;
    }
    const parsed = sttRecognitionLineSchema.safeParse(parsedJson);
    if (!parsed.success) continue;
    const refinedText = parsed.data.result.finalRefinement?.normalizedText.alternatives[0]?.text;
    if (refinedText) {
      refinedFinals.push(refinedText);
      continue;
    }
    const finalText = parsed.data.result.final?.alternatives[0]?.text;
    if (finalText) rawFinals.push(finalText);
  }
  return (refinedFinals.length ? refinedFinals : rawFinals).join(" ").trim();
}

async function fetchRecognitionText(apiKey: string, operationId: string): Promise<string> {
  const query = new URLSearchParams({ operationId });
  const response = await fetch(`https://stt.api.cloud.yandex.net/stt/v3/getRecognition?${query.toString()}`, {
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(typo(`SpeechKit STT (результат): ${await readSpeechError(response)}`));
  return extractRecognitionText(await response.text());
}

/** Распознавание короткой реплики (ru-RU): ogg/webm/mp4 от MediaRecorder приводятся к ogg/opus. */
export async function recognizeSpeech(audio: Buffer, mimeType: string): Promise<string> {
  const { apiKey } = speechCredentials();
  const oggAudio = await normalizeSttAudio(audio, mimeType);
  const operationId = await startRecognition(apiKey, oggAudio);
  await waitRecognitionDone(apiKey, operationId);
  return fetchRecognitionText(apiKey, operationId);
}

// In-memory LRU-кэш синтеза: реплики ученика короткие и часто повторяются («а почему?»),
// повторный синтез — лишние деньги и задержка. Map хранит порядок вставки — им и вытесняем.
const TTS_CACHE_MAX = 100;
const ttsCache = new Map<string, Buffer>();

function ttsCacheKey(text: string): string {
  return createHash("sha1").update(`${TTS_VOICE}:${text}`).digest("hex");
}

/** Синтез реплики ученика (ogg/opus). Текст длиннее лимита обрезается вызывающей стороной. */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const { apiKey, folderId } = speechCredentials();
  const trimmed = text.slice(0, MAX_TTS_CHARS);

  const cacheKey = ttsCacheKey(trimmed);
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    // Обновляем «свежесть»: перевставка двигает запись в конец порядка вытеснения.
    ttsCache.delete(cacheKey);
    ttsCache.set(cacheKey, cached);
    return cached;
  }

  const form = new URLSearchParams({
    text: trimmed,
    lang: "ru-RU",
    voice: TTS_VOICE,
    emotion: TTS_EMOTION,
    format: "oggopus",
    folderId,
  });
  const response = await fetch("https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize", {
    method: "POST",
    headers: { Authorization: `Api-Key ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(typo(`SpeechKit TTS: ${response.status} ${details.slice(0, 300)}`));
  }
  const audio = Buffer.from(await response.arrayBuffer());

  ttsCache.set(cacheKey, audio);
  if (ttsCache.size > TTS_CACHE_MAX) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey) ttsCache.delete(oldestKey);
  }
  return audio;
}
