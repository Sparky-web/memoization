import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Ручное управление карточками внутри колоды (массовый импорт — через createDeck).

const cardFieldsInput = zodRussian.object({
  question: zodRussian.string().min(1).max(4000),
  answer: zodRussian.string().min(1).max(8000),
  answerDeep: zodRussian.string().max(30000).nullable(),
});

export const addCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string(), data: cardFieldsInput }))
  .handler(async ({ data: input, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: input.deckId, userId: context.session.user.id },
      select: { id: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    const lastCard = await context.db.card.findFirst({
      where: { deckId: deck.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await context.db.card.create({
      data: {
        deckId: deck.id,
        question: input.data.question,
        answer: input.data.answer,
        answerDeep: input.data.answerDeep,
        position: (lastCard?.position ?? -1) + 1,
      },
    });
    return true;
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), data: cardFieldsInput }))
  .handler(async ({ data: input, context }) => {
    const result = await context.db.card.updateMany({
      where: { id: input.id, deck: { userId: context.session.user.id } },
      data: input.data,
    });
    if (result.count === 0) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.card.deleteMany({
      where: { id: data.id, deck: { userId: context.session.user.id } },
    });
    if (result.count === 0) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });
