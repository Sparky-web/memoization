import { createFileRoute } from "@tanstack/react-router";

import { typo } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { enqueueGeneration, type GenerationFile } from "~/server/generation";

// Приём материалов/вопросов (текст + файлы) и постановка колоды в очередь генерации claude -p.
const MAX_FILES_PER_FIELD = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function clampRequired(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 10);
}

async function collectFiles(values: FormDataEntryValue[], field: "materials" | "questions"): Promise<GenerationFile[]> {
  const files: GenerationFile[] = [];
  for (const value of values) {
    if (typeof value === "string" || value.size === 0) continue;
    if (value.size > MAX_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
    files.push({ field, name: value.name, bytes: Buffer.from(await value.arrayBuffer()) });
    if (files.length > MAX_FILES_PER_FIELD) throw new Error("TOO_MANY_FILES");
  }
  return files;
}

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("UNAUTHORIZED", { status: 401 });

        const form = await request.formData();
        const materialsText = asString(form.get("materials"));
        const questionsText = asString(form.get("questions"));
        const requiredCorrect = clampRequired(Number(asString(form.get("requiredCorrect"))));

        let files: GenerationFile[];
        try {
          const materialsFiles = await collectFiles(form.getAll("materialsFiles"), "materials");
          const questionsFiles = await collectFiles(form.getAll("questionsFiles"), "questions");
          files = [...materialsFiles, ...questionsFiles];
        } catch {
          return Response.json({ error: "FILES" }, { status: 400 });
        }

        const hasInput = materialsText.trim().length > 0 || questionsText.trim().length > 0 || files.length > 0;
        if (!hasInput) return Response.json({ error: "EMPTY" }, { status: 400 });

        const deck = await db.deck.create({
          data: {
            userId: session.user.id,
            title: typo("Колода генерируется…"),
            description: null,
            requiredCorrect,
            status: "processing",
          },
          select: { id: true },
        });

        enqueueGeneration(deck.id, { materialsText, questionsText, files });

        return Response.json({ deckId: deck.id });
      },
    },
  },
});
