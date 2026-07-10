import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { palaceLociSchema, parsePalaceImages, typo, zodRussian } from "~/lib";
import { runModelPrompt } from "~/server/chat";
import { authMiddleware } from "~/server/middleware";
import { assertChatQuota, recordUsage } from "~/server/usage";

// Дворец памяти для «упрямых» карточек-списков: пользователь называет знакомый маршрут
// и места, ИИ помогает придумать яркие абсурдные образы «пункт ↔ место». Доступен и Free
// (генерация образов идёт в общую разговорную квоту).

const placesInput = zodRussian.array(zodRussian.string().min(1).max(200)).min(4).max(8);

/** Контекст мастера: карточка + существующий дворец (редактирование вместо второго создания). */
export const getPalaceContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, exam: { userId } },
      select: { id: true, prompt: true, answer: true, examId: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    const palace = await context.db.memoryPalace.findFirst({
      where: { userId, cardId: card.id },
      select: { id: true, title: true, loci: true },
    });
    return {
      card,
      palace: palace
        ? { id: palace.id, title: palace.title, loci: palaceLociSchema.safeParse(palace.loci).data ?? [] }
        : null,
    };
  });

function buildImagesPrompt(card: { prompt: string; answer: string }, places: string[]): string {
  return [
    typo(
      `Студент строит дворец памяти для карточки-списка. Разбей содержимое ответа на ${places.length} пунктов по порядку (объедини или раздели пункты, чтобы получилось ровно столько) и для каждого придумай яркий, абсурдный, конкретный образ, который связывает пункт с местом маршрута. Образ — 1–2 предложения по-русски, зрительный и странный: странное запоминается.`,
    ),
    "",
    `${typo("Вопрос карточки")}: ${card.prompt}`,
    `${typo("Ответ (список для запоминания)")}: ${card.answer}`,
    "",
    typo("Места маршрута по порядку:"),
    places.map((place, index) => `${index + 1}. ${place}`).join("\n"),
    "",
    typo(
      'Ответь СТРОГО одним JSON-массивом без пояснений: [{"place":"место из списка","item":"пункт списка","image":"яркий образ"}] — в том же порядке, что и места.',
    ),
  ].join("\n");
}

export const generatePalaceImages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string(), places: placesInput }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, exam: { userId } },
      select: { id: true, prompt: true, answer: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    await assertChatQuota(context.db, userId);

    let loci: ReturnType<typeof parsePalaceImages>;
    try {
      loci = parsePalaceImages(await runModelPrompt(buildImagesPrompt(card, data.places)));
    } catch (error) {
      console.error(error);
      setResponseStatus(502);
      throw new Error(typo("Не удалось придумать образы. Попробуйте ещё раз."), { cause: error });
    }

    try {
      await recordUsage(context.db, userId, "chat_message", card.id);
    } catch (error) {
      console.error("Не удалось записать использование образов дворца", error);
    }

    // Образы не сохраняются здесь: пользователь сперва правит пары в мастере.
    return { loci };
  });

export const createMemoryPalace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      cardId: zodRussian.string(),
      title: zodRussian.string().min(1).max(200),
      loci: palaceLociSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, exam: { userId } },
      select: { id: true, examId: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    // На карточку — один дворец: повторное сохранение обновляет существующий маршрут.
    const existing = await context.db.memoryPalace.findFirst({
      where: { userId, cardId: card.id },
      select: { id: true },
    });
    if (existing) {
      await context.db.memoryPalace.update({
        where: { id: existing.id },
        data: { title: data.title, loci: data.loci },
      });
      return { id: existing.id };
    }
    const palace = await context.db.memoryPalace.create({
      data: { userId, examId: card.examId, cardId: card.id, title: data.title, loci: data.loci },
      select: { id: true },
    });
    return { id: palace.id };
  });

export const updateMemoryPalace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      id: zodRussian.string(),
      title: zodRussian.string().min(1).max(200).optional(),
      loci: palaceLociSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const result = await context.db.memoryPalace.updateMany({
      where: { id: data.id, userId: context.session.user.id },
      data: { ...(data.title ? { title: data.title } : {}), loci: data.loci },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Дворец не найден"));
    }
    return true;
  });

export const deleteMemoryPalace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.memoryPalace.deleteMany({
      where: { id: data.id, userId: context.session.user.id },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Дворец не найден"));
    }
    return true;
  });
