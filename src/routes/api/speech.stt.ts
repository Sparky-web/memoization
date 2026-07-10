import { createFileRoute } from "@tanstack/react-router";

import { PAYWALL_ERRORS, typo } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { hasActivePro } from "~/server/entitlement";
import { isSpeechConfigured, MAX_STT_BYTES, recognizeSpeech } from "~/server/speech";

// Распознавание речи для голосового «объясни ученику»: тело запроса — сырое аудио
// MediaRecorder (ogg/webm c opus), mime — в Content-Type. Pro-функция; без ключей — 503.

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

        try {
          const text = await recognizeSpeech(audio, request.headers.get("content-type") ?? "audio/ogg");
          if (!text) {
            return Response.json({ error: typo("Речь не распозналась — попробуйте ещё раз") }, { status: 422 });
          }
          return Response.json({ text });
        } catch (error) {
          console.error(error);
          return Response.json({ error: typo("Не удалось распознать речь — попробуйте ещё раз") }, { status: 502 });
        }
      },
    },
  },
});
