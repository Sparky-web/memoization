import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Выгрузка тревог (экспрессивное письмо перед экзаменом). Записи строго приватные:
// читает и удаляет только владелец, наружу отдаём даты и короткое превью — не полный текст.

const PREVIEW_LENGTH = 80;

export const createAnxietyDump = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      examId: zodRussian.string().nullable(),
      content: zodRussian.string().min(1).max(20_000),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    if (data.examId) {
      const exam = await context.db.exam.findFirst({ where: { id: data.examId, userId }, select: { id: true } });
      if (!exam) {
        setResponseStatus(404);
        throw new Error(typo("Экзамен не найден"));
      }
    }
    const dump = await context.db.anxietyDump.create({
      data: { userId, examId: data.examId, content: data.content },
      select: { id: true, createdAt: true },
    });
    return dump;
  });

export const getAnxietyDumps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string().nullable() }))
  .handler(async ({ data, context }) => {
    const dumps = await context.db.anxietyDump.findMany({
      where: { userId: context.session.user.id, ...(data.examId ? { examId: data.examId } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, content: true },
    });
    return dumps.map((dump) => ({
      id: dump.id,
      createdAt: dump.createdAt,
      preview: dump.content.length > PREVIEW_LENGTH ? `${dump.content.slice(0, PREVIEW_LENGTH)}…` : dump.content,
    }));
  });

export const deleteAnxietyDump = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.anxietyDump.deleteMany({
      where: { id: data.id, userId: context.session.user.id },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Запись не найдена"));
    }
    return true;
  });

export type AnxietyDumpItem = Awaited<ReturnType<typeof getAnxietyDumps>>[number];
