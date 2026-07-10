import { createFileRoute } from "@tanstack/react-router";

import { PAYWALL_ERRORS, typo, zodRussian } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { hasActivePro } from "~/server/entitlement";
import { isSpeechConfigured, MAX_TTS_CHARS, synthesizeSpeech } from "~/server/speech";

// Озвучка реплики ученика голосом SpeechKit (ogg/opus). Pro-функция; без ключей — 503.

const ttsInput = zodRussian.object({ text: zodRussian.string().min(1).max(MAX_TTS_CHARS) });

export const Route = createFileRoute("/api/speech/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

        if (!(await hasActivePro(db, session.user.id))) {
          return Response.json({ error: PAYWALL_ERRORS.VOICE }, { status: 402 });
        }
        if (!isSpeechConfigured()) {
          return Response.json({ error: typo("Озвучка не настроена на сервере") }, { status: 503 });
        }

        const payload: unknown = await request.json().catch(() => null);
        const parsed = ttsInput.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: typo("Нужен текст до 500 символов") }, { status: 400 });
        }

        try {
          const audio = await synthesizeSpeech(parsed.data.text);
          return new Response(new Uint8Array(audio), {
            headers: { "Content-Type": "audio/ogg", "Cache-Control": "no-store" },
          });
        } catch (error) {
          console.error(error);
          return Response.json({ error: typo("Не удалось озвучить реплику") }, { status: 502 });
        }
      },
    },
  },
});
