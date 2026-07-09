import { createFileRoute } from "@tanstack/react-router";

import { FREE_DECK_GENERATIONS, PAYWALL_ERRORS, PRO_DECK_GENERATIONS_PER_DAY, startOfDayMsk, typo } from "~/lib";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { hasActivePro } from "~/server/entitlement";
import { enqueueGeneration, type GenerationFile } from "~/server/generation";
import { countUsageToday, countUsageTotal, tryChargeUsage } from "~/server/usage";

// Приём материалов/вопросов (текст + файлы) и постановка экзамена в очередь генерации claude -p.
// Волна 2 заменит поток на «вопросы → ответы → карточки»; форма и гейты сохраняются.
const MAX_FILES_PER_FIELD = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const FAIR_USE_ERROR = typo("Дневной fair-use лимит генераций исчерпан — попробуйте завтра");

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
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

        // Гейт монетизации: генерация — самый дорогой вызов (opus). Free — 1 за всё время,
        // Pro — дневной fair-use. Клиент различает случаи по коду/тексту в error.
        // Здесь — только быстрый отказ до разбора формы; гонкоустойчивое списание — ниже.
        const pro = await hasActivePro(db, session.user.id);
        if (!pro) {
          const usedTotal = await countUsageTotal(db, session.user.id, "deck_generation");
          if (usedTotal >= FREE_DECK_GENERATIONS) {
            return Response.json({ error: PAYWALL_ERRORS.GENERATION }, { status: 402 });
          }
        } else {
          const usedToday = await countUsageToday(db, session.user.id, "deck_generation");
          if (usedToday >= PRO_DECK_GENERATIONS_PER_DAY) {
            return Response.json({ error: FAIR_USE_ERROR }, { status: 402 });
          }
        }

        const form = await request.formData();
        const materialsText = asString(form.get("materials"));
        const questionsText = asString(form.get("questions"));
        // Пожелания к стилю/форме ответов — ограничиваем длину, чтобы не раздувать промпт.
        const instructions = asString(form.get("instructions")).slice(0, 4000);

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

        const exam = await db.exam.create({
          data: {
            userId: session.user.id,
            title: typo("Экзамен генерируется…"),
            description: null,
            status: "processing",
          },
          select: { id: true },
        });

        // Попытка списывается до постановки в очередь атомарно (проверка лимита и запись
        // события — под одним локом): параллельные запросы не обходят лимит гонкой между
        // count и create. При провале генерации попытка вернётся (refundUsage).
        const charged = pro
          ? await tryChargeUsage(db, {
              userId: session.user.id,
              kind: "deck_generation",
              refId: exam.id,
              limit: PRO_DECK_GENERATIONS_PER_DAY,
              since: startOfDayMsk(new Date()),
            })
          : await tryChargeUsage(db, {
              userId: session.user.id,
              kind: "deck_generation",
              refId: exam.id,
              limit: FREE_DECK_GENERATIONS,
            });
        if (!charged) {
          // Гонку проиграли — лимит выбрали параллельные запросы; пустой экзамен убираем.
          await db.exam.delete({ where: { id: exam.id } });
          return Response.json({ error: pro ? FAIR_USE_ERROR : PAYWALL_ERRORS.GENERATION }, { status: 402 });
        }
        enqueueGeneration(exam.id, { materialsText, questionsText, instructions, files });

        return Response.json({ examId: exam.id });
      },
    },
  },
});
