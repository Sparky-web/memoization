import path from "node:path";

import { createFileRoute } from "@tanstack/react-router";

import { startOfDayMsk, typo } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { parseQuestionsFromFile, QUESTIONS_NOT_FOUND } from "~/server/questionParse";
import { refundUsage, tryChargeUsage } from "~/server/usage";

// Разбор файла с вопросами (мастер, шаг «Вопросы»): multipart с одним файлом.
// Лимиты вопросов тарифа применяет существующий setExamQuestions — здесь только извлечение.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".doc", ".txt", ".md"];
// Анти-абьюз: каждый вызов — живой запуск ИИ; 10 разборов в день всем тарифам.
const PARSES_PER_DAY = 10;

export const Route = createFileRoute("/api/questions/parse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("UNAUTHORIZED", { status: 401 });
        const userId = session.user.id;

        const form = await request.formData();
        const file = form.get("file");
        if (!file || typeof file === "string" || !file.size) {
          return Response.json({ error: "EMPTY" }, { status: 400 });
        }
        if (file.size > MAX_FILE_BYTES) return Response.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
        if (!ALLOWED_EXTENSIONS.includes(path.extname(file.name).toLowerCase())) {
          return Response.json({ error: "FILE_TYPE" }, { status: 400 });
        }

        const charged = await tryChargeUsage(db, {
          userId,
          kind: "question_parse",
          refId: file.name.slice(0, 100),
          limit: PARSES_PER_DAY,
          since: startOfDayMsk(new Date()),
        });
        if (!charged) {
          return Response.json(
            { error: typo(`Дневной лимит разборов файла (${PARSES_PER_DAY}) исчерпан — попробуйте завтра`) },
            { status: 429 },
          );
        }

        try {
          const questions = await parseQuestionsFromFile({
            fileName: file.name,
            buffer: Buffer.from(await file.arrayBuffer()),
          });
          return Response.json({ questions });
        } catch (error) {
          // «Не список вопросов» — честный результат живого прогона, попытка потрачена.
          if (error instanceof Error && error.message === QUESTIONS_NOT_FOUND) {
            return Response.json({ error: QUESTIONS_NOT_FOUND }, { status: 422 });
          }
          // Технический сбой (таймаут/спавн) попытку не сжигает.
          await refundUsage(db, "question_parse", [file.name.slice(0, 100)]).catch(() => undefined);
          console.error("question parse failed:", error);
          const message = error instanceof Error && /[а-яё]/i.test(error.message) ? error.message : null;
          return Response.json(
            { error: message ?? typo("Не удалось разобрать файл — попробуйте ещё раз") },
            { status: 502 },
          );
        }
      },
    },
  },
});
