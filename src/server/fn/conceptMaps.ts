import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import {
  FREE_CONCEPT_MAPS,
  mapEdgesSchema,
  mapNodesSchema,
  parseConceptMapDraft,
  PAYWALL_ERRORS,
  typo,
  zodRussian,
} from "~/lib";
import { runModelPrompt } from "~/server/chat";
import { authMiddleware } from "~/server/middleware";
import { assertChatQuota, recordUsage } from "~/server/usage";

// Карты связей: ИИ набрасывает черновик-скелет по вопросам темы, пользователь достраивает
// сам в SVG-редакторе — пользу приносит именно построение (спека, эффект ≈ 0,72).

export const getConceptMaps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const maps = await context.db.conceptMap.findMany({
      where: { examId: data.examId, userId: context.session.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, nodes: true, edges: true, updatedAt: true },
    });
    // Битые данные не валят страницу: невалидный JSON превращается в пустую карту.
    return maps.map((map) => ({
      id: map.id,
      title: map.title,
      updatedAt: map.updatedAt,
      nodes: mapNodesSchema.safeParse(map.nodes).data ?? [],
      edges: mapEdgesSchema.safeParse(map.edges).data ?? [],
    }));
  });

function buildDraftPrompt(input: { topic: string; questions: string[] }): string {
  return [
    typo(
      `Построй черновик карты связей (concept map) по теме «${input.topic}» для подготовки к экзамену. Выдели 6–12 ключевых понятий и связи между ними с короткими подписями отношений («вызывает», «часть», «пример», …). Это скелет: студент достроит карту сам, не делай её исчерпывающей.`,
    ),
    "",
    typo("Вопросы темы:"),
    input.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
    "",
    typo(
      'Ответь СТРОГО одним JSON без пояснений, в формате: {"nodes":[{"id":"n1","label":"Понятие"}],"edges":[{"from":"n1","to":"n2","label":"связь"}]}. Подписи узлов — до 5 слов, по-русски.',
    ),
  ].join("\n");
}

export const generateConceptMapDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string(), topic: zodRussian.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true, title: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }

    // Free — одна карта всего (по всем экзаменам); Pro — без потолка.
    const pro = await assertChatQuota(context.db, userId);
    if (!pro) {
      const mapCount = await context.db.conceptMap.count({ where: { userId } });
      if (mapCount >= FREE_CONCEPT_MAPS) {
        setResponseStatus(402);
        throw new Error(PAYWALL_ERRORS.MAPS);
      }
    }

    const questions = await context.db.question.findMany({
      where: { examId: exam.id, ...(data.topic ? { topic: data.topic } : {}) },
      orderBy: { position: "asc" },
      take: 30,
      select: { text: true },
    });
    if (!questions.length) {
      setResponseStatus(400);
      throw new Error(typo("По этой теме нет вопросов — черновик не из чего строить"));
    }

    const title = data.topic ?? exam.title;
    let draft: ReturnType<typeof parseConceptMapDraft>;
    try {
      const raw = await runModelPrompt(
        buildDraftPrompt({ topic: title, questions: questions.map((question) => question.text) }),
      );
      draft = parseConceptMapDraft(raw);
    } catch (error) {
      console.error(error);
      setResponseStatus(502);
      throw new Error(typo("Не удалось построить черновик. Попробуйте ещё раз."), { cause: error });
    }

    const map = await context.db.conceptMap.create({
      data: { userId, examId: exam.id, title, nodes: draft.nodes, edges: draft.edges },
      select: { id: true },
    });

    try {
      await recordUsage(context.db, userId, "chat_message", map.id);
    } catch (error) {
      console.error("Не удалось записать использование черновика карты", error);
    }

    return { id: map.id };
  });

export const updateConceptMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      id: zodRussian.string(),
      title: zodRussian.string().min(1).max(200).optional(),
      nodes: mapNodesSchema,
      edges: mapEdgesSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    // Рёбра к несуществующим узлам не сохраняем — редактор мог удалить узел без чистки связей.
    const nodeIds = new Set(data.nodes.map((node) => node.id));
    const edges = data.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
    const result = await context.db.conceptMap.updateMany({
      where: { id: data.id, userId: context.session.user.id },
      data: { ...(data.title ? { title: data.title } : {}), nodes: data.nodes, edges },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карта не найдена"));
    }
    return true;
  });

export const deleteConceptMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.conceptMap.deleteMany({
      where: { id: data.id, userId: context.session.user.id },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карта не найдена"));
    }
    return true;
  });

export type ConceptMapItem = Awaited<ReturnType<typeof getConceptMaps>>[number];
