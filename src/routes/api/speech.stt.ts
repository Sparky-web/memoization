import { createFileRoute } from "@tanstack/react-router";

import { PAYWALL_ERRORS, PRO_SPEECH_PER_DAY, startOfDayMsk, typo } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { hasActivePro } from "~/server/entitlement";
import { isSpeechConfigured, MAX_STT_BYTES, recognizeSpeech } from "~/server/speech";
import { refundUsage, tryChargeUsage } from "~/server/usage";

// Распознавание речи для голосового «объясни ученику»: тело запроса — сырое аудио
// MediaRecorder (ogg/webm с opus или mp4/AAC из Safari — сервер перепакует в ogg/opus),
// mime — в Content-Type. Pro-функция; без ключей — 503.

export const Route = createFileRoute("/api/speech/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

        if (!(await hasActivePro(db, session.user.id))) {
          return Response.json({ error: PAYWALL_ERRORS.VOICE }, { status: 402 });
        }
        if (!isSpeechConfigured()) {
          return Response.json({ error: typo("Распознавание речи не настроено на сервере") }, { status: 503 });
        }

        const audio = Buffer.from(await request.arrayBuffer());
        if (!audio.length) {
          return Response.json({ error: typo("Пустая запись — зажмите кнопку и говорите") }, { status: 400 });
        }
        if (audio.length > MAX_STT_BYTES) {
          return Response.json({ error: typo("Запись слишком длинная — до 30 секунд") }, { status: 400 });
        }

        // Дневная квота на голосовые вызовы (fair-use): роут дёргается и мимо UI, без потолка
        // это неограниченный платный трафик к SpeechKit. refId = userId — для компенсации при сбое.
        const charged = await tryChargeUsage(db, {
          userId: session.user.id,
          kind: "speech",
          refId: session.user.id,
          limit: PRO_SPEECH_PER_DAY,
          since: startOfDayMsk(new Date()),
        });
        if (!charged) {
          return Response.json(
            { error: typo("Дневной лимит голосовых запросов исчерпан — продолжите текстом") },
            { status: 429 },
          );
        }

        try {
          const text = await recognizeSpeech(audio, request.headers.get("content-type") ?? "audio/ogg");
          if (!text) {
            return Response.json({ error: typo("Речь не распозналась — попробуйте ещё раз") }, { status: 422 });
          }
          return Response.json({ text });
        } catch (error) {
          console.error(error);
          // SpeechKit не ответил — попытку возвращаем: сбой провайдера не должен жечь квоту.
          await refundUsage(db, "speech", [session.user.id]).catch(() => undefined);
          return Response.json({ error: typo("Не удалось распознать речь — попробуйте ещё раз") }, { status: 502 });
        }
      },
    },
  },
});
