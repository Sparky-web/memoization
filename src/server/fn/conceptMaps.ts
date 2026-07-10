import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import {
  FREE_CONCEPT_MAPS,
  mapEdgesSchema,
  mapNodesSchema,
  mergeConceptMapDraft,
  parseConceptMapDraft,
  PAYWALL_ERRORS,
  typo,
  zodRussian,
} from "~/lib";
import { runModelPrompt } from "~/server/chat";
import { hasActivePro } from "~/server/entitlement";
import { authMiddleware } from "~/server/middleware";
import { assertChatQuota, recordUsage } from "~/server/usage";

// Карты связей: пользователь формулирует связи списком «понятие → понятие», граф рисуется
// сам — пользу приносит именно построение схемы (спека, эффект ≈ 0,72). ИИ набрасывает
// черновик-скелет по вопросам темы. Координаты узлов не хранятся: раскладку считает клиент.

// Старые карты SVG-редактора хранят x/y в узлах — координаты отбрасываются при чтении.
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
      nodes: (mapNodesSchema.safeParse(map.nodes).data ?? []).map((node) => ({ id: node.id, label: node.label })),
      edges: mapEdgesSchema.safeParse(map.edges).data ?? [],
    }));
  });

/** Гейт лимита Free: одна карта всего, по всем экзаменам; Pro — без потолка. */
async function assertFreeMapLimit(db: Parameters<typeof hasActivePro>[0], userId: string, pro: boolean): Promise<void> {
  if (pro) return;
  const mapCount = await db.conceptMap.count({ where: { userId } });
  if (mapCount >= FREE_CONCEPT_MAPS) {
    setResponseStatus(402);
    throw new Error(PAYWALL_ERRORS.MAPS);
  }
}

// Пустая карта под ручное построение связей — без ИИ и без списания квоты чата.
export const createConceptMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
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
    await assertFreeMapLimit(context.db, userId, await hasActivePro(context.db, userId));
    const map = await context.db.conceptMap.create({
      data: { userId, examId: exam.id, title: exam.title, nodes: [], edges: [] },
      select: { id: true },
    });
    return { id: map.id };
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

// Черновик от ИИ: с mapId — доливает связи в существующую карту (узлы совпадают по подписи),
// без mapId — создаёт новую карту (здесь действует лимит Free «одна карта всего»).
export const generateConceptMapDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      examId: zodRussian.string(),
      topic: zodRussian.string().max(200).optional(),
      mapId: zodRussian.string().optional(),
    }),
  )
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

    const targetMap = data.mapId
      ? await context.db.conceptMap.findFirst({
          where: { id: data.mapId, userId },
          select: { id: true, nodes: true, edges: true },
        })
      : null;
    if (data.mapId && !targetMap) {
      setResponseStatus(404);
      throw new Error(typo("Карта не найдена"));
    }

    const pro = await assertChatQuota(context.db, userId);
    if (!targetMap) await assertFreeMapLimit(context.db, userId, pro);

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

    let mapId: string;
    if (targetMap) {
      const merged = mergeConceptMapDraft(
        {
          nodes: (mapNodesSchema.safeParse(targetMap.nodes).data ?? []).map((node) => ({
            id: node.id,
            label: node.label,
          })),
          edges: mapEdgesSchema.safeParse(targetMap.edges).data ?? [],
        },
        draft,
      );
      await context.db.conceptMap.update({
        where: { id: targetMap.id },
        data: { nodes: merged.nodes, edges: merged.edges },
      });
      mapId = targetMap.id;
    } else {
      const map = await context.db.conceptMap.create({
        data: { userId, examId: exam.id, title, nodes: draft.nodes, edges: draft.edges },
        select: { id: true },
      });
      mapId = map.id;
    }

    try {
      await recordUsage(context.db, userId, "chat_message", mapId);
    } catch (error) {
      console.error("Не удалось записать использование черновика карты", error);
    }

    return { id: mapId };
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
