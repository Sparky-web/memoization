import { randomUUID } from "node:crypto";
import path from "node:path";

import { createFileRoute } from "@tanstack/react-router";

import { PAYWALL_ERRORS } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { hasActivePro } from "~/server/entitlement";
import { safeFileName, saveMaterialFile } from "~/server/materialStorage";

// Загрузка материалов экзамена (multipart, поле files) — Pro-функция (PAYWALL_MATERIALS).
// Файл ложится в data/materials/<examId>/<materialId>_<safe-name>, метаданные — в Material.
const MAX_FILES_PER_EXAM = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS: readonly string[] = [".pdf", ".docx", ".doc", ".txt", ".md"];

export const Route = createFileRoute("/api/materials/$examId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("UNAUTHORIZED", { status: 401 });

        if (!(await hasActivePro(db, session.user.id))) {
          return Response.json({ error: PAYWALL_ERRORS.MATERIALS }, { status: 402 });
        }

        const exam = await db.exam.findFirst({
          where: { id: params.examId, userId: session.user.id },
          select: { id: true },
        });
        if (!exam) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

        const form = await request.formData();
        const files: File[] = [];
        for (const value of form.getAll("files")) {
          if (typeof value === "string" || !value.size) continue;
          if (value.size > MAX_FILE_BYTES) return Response.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
          if (!ALLOWED_EXTENSIONS.includes(path.extname(value.name).toLowerCase())) {
            return Response.json({ error: "FILE_TYPE" }, { status: 400 });
          }
          files.push(value);
        }
        if (!files.length) return Response.json({ error: "EMPTY" }, { status: 400 });

        const existingCount = await db.material.count({ where: { examId: exam.id } });
        if (existingCount + files.length > MAX_FILES_PER_EXAM) {
          return Response.json({ error: "TOO_MANY_FILES" }, { status: 400 });
        }

        const saved = [];
        for (const file of files) {
          // id генерируем заранее: он входит в имя файла на диске (storagePath).
          const materialId = randomUUID();
          const storagePath = await saveMaterialFile(
            exam.id,
            `${materialId}_${safeFileName(file.name)}`,
            Buffer.from(await file.arrayBuffer()),
          );
          const material = await db.material.create({
            data: {
              id: materialId,
              examId: exam.id,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              sizeBytes: file.size,
              storagePath,
            },
            select: { id: true, fileName: true, sizeBytes: true },
          });
          saved.push(material);
        }

        return Response.json({ materials: saved });
      },
    },
  },
});
