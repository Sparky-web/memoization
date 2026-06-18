import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { importedCardSchema, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Колода — подготовка к экзамену. Все операции скоупятся по userId сессии.

// Порог «усвоено» в днях (синхронизирован с cardStage в ~/lib).
const MASTERED_INTERVAL_DAYS = 21;

const deckFieldsInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).nullable(),
});

const createDeckInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).nullable(),
  cards: zodRussian.array(importedCardSchema).max(2000),
});

export const getDecks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const now = new Date();

    const decks = await context.db.deck.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        _count: { select: { cards: true } },
      },
    });

    // Агрегаты «к повторению» и «усвоено» — два groupBy на все колоды, без N+1.
    const dueGroups = await context.db.card.groupBy({
      by: ["deckId"],
      where: { deck: { userId }, dueAt: { lte: now } },
      _count: { _all: true },
    });
    const masteredGroups = await context.db.card.groupBy({
      by: ["deckId"],
      where: { deck: { userId }, reps: { gt: 0 }, intervalDays: { gte: MASTERED_INTERVAL_DAYS } },
      _count: { _all: true },
    });

    const dueByDeck = new Map(dueGroups.map((group) => [group.deckId, group._count._all]));
    const masteredByDeck = new Map(masteredGroups.map((group) => [group.deckId, group._count._all]));

    return decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      description: deck.description,
      createdAt: deck.createdAt,
      totalCards: deck._count.cards,
      dueCount: dueByDeck.get(deck.id) ?? 0,
      masteredCount: masteredByDeck.get(deck.id) ?? 0,
    }));
  });

export const getDeckById = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.id, userId: context.session.user.id },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        cards: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            question: true,
            answer: true,
            box: true,
            intervalDays: true,
            dueAt: true,
            reps: true,
            correctCount: true,
            wrongCount: true,
            lastReviewedAt: true,
          },
        },
      },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    return deck;
  });

export const createDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createDeckInput)
  .handler(({ data, context }) =>
    context.db.deck.create({
      data: {
        userId: context.session.user.id,
        title: data.title,
        description: data.description,
        cards: {
          create: data.cards.map((card, index) => ({ question: card.question, answer: card.answer, position: index })),
        },
      },
      select: { id: true },
    }),
  );

export const updateDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), data: deckFieldsInput }))
  .handler(async ({ data: input, context }) => {
    const result = await context.db.deck.updateMany({
      where: { id: input.id, userId: context.session.user.id },
      data: input.data,
    });
    if (result.count === 0) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    return true;
  });

export const deleteDeck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.deck.deleteMany({
      where: { id: data.id, userId: context.session.user.id },
    });
    if (result.count === 0) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    return true;
  });

export type DeckListItem = Awaited<ReturnType<typeof getDecks>>[number];
export type DeckDetail = Awaited<ReturnType<typeof getDeckById>>;
export type DeckCard = DeckDetail["cards"][number];
