import { createHash } from "node:crypto";

import { serverEnv } from "~/env.server";
import { typo } from "~/lib";

// Голосовой слой «объясни ученику»: прокси к Яндекс SpeechKit v1 (docs/domashnik.md, раздел 6).
// Ключи опциональны — без них роуты /api/speech/* отвечают 503, UI прячет голосовой режим.

const SPEECH_TIMEOUT_MS = 20_000;

/** Потолок аудио для распознавания — ограничение синхронного API SpeechKit. */
export const MAX_STT_BYTES = 1024 * 1024;
/** Потолок текста на синтез: реплики ученика короткие, длиннее — обрезаем на клиенте. */
export const MAX_TTS_CHARS = 500;

// «Ученик» — мужской молодой голос; anton поддерживает эмоцию good (доброжелательный тон).
const TTS_VOICE = "anton";
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

// MediaRecorder пишет opus-поток в контейнере ogg (Firefox/Safari) или webm (Chrome).
// SpeechKit v1 декларирует oggopus; webm-opus несёт ту же дорожку — отправляем как oggopus,
// на несовместимость ответит читаемая ошибка распознавания (проверяется живыми ключами в В7).
function sttFormatOf(mimeType: string): string {
  return mimeType.includes("lpcm") ? "lpcm" : "oggopus";
}

function parseSttResponse(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "result" in payload) {
    const result: unknown = payload.result;
    if (typeof result === "string") return result;
  }
  throw new Error(typo("SpeechKit вернул неожиданный ответ"));
}

/** Распознавание короткой реплики (ru-RU). Принимает ogg/webm-opus от MediaRecorder. */
export async function recognizeSpeech(audio: Buffer, mimeType: string): Promise<string> {
  const { apiKey, folderId } = speechCredentials();
  const query = new URLSearchParams({
    lang: "ru-RU",
    format: sttFormatOf(mimeType),
    folderId,
  });
  const response = await fetch(`https://stt.api.cloud.yandex.net/speech/v1/recognize?${query.toString()}`, {
    method: "POST",
    headers: { Authorization: `Api-Key ${apiKey}`, "Content-Type": mimeType || "audio/ogg" },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(typo(`SpeechKit STT: ${response.status} ${details.slice(0, 300)}`));
  }
  const payload: unknown = await response.json();
  return parseSttResponse(payload).trim();
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
