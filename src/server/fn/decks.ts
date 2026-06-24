import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import { importedCardSchema, typo, zodRussian } from "~/lib";
import { auth } from "~/server/auth";
import { authMiddleware, baseMiddleware } from "~/server/middleware";

// Колода — подготовка к экзамену. Прогресс повторения у каждого пользователя свой (CardProgress):
// свою колоду владелец учит как обычно, а публичную чужую можно добавить в избранное и учить по своей ссылке.

// Колода доступна пользователю, если он владелец ИЛИ добавил ещё публичную колоду в избранное.
function accessibleDeckWhere(userId: string) {
  return { OR: [{ userId }, { isPublic: true, favorites: { some: { userId } } }] };
}

// Сколько карточек отдаём в публичном превью по ссылке (остальные — после добавления к себе).
const PUBLIC_PREVIEW_LIMIT = 12;

const deckFieldsInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).nullable(),
  requiredCorrect: zodRussian.number().int().min(1).max(10),
});

const createDeckInput = zodRussian.object({
  title: zodRussian.string().min(1).max(200),
  description: zodRussian.string().max(2000).nullable(),
  requiredCorrect: zodRussian.number().int().min(1).max(10),
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
        status: true,
        exercisesStatus: true,
        isPublic: true,
        createdAt: true,
        _count: { select: { cards: true } },
      },
    });

    // Агрегаты «к повторению» и «усвоено» по прогрессу владельца — два запроса на все колоды, без N+1.
    // Карточка к повторению, если у неё нет прогресса (новая) или наступил срок.
    const dueGroups = await context.db.$queryRaw<{ deckId: string; n: number }[]>`
      SELECT c."deckId" AS "deckId", count(*)::int AS n
      FROM "Card" c
      JOIN "Deck" d ON d.id = c."deckId"
      LEFT JOIN "CardProgress" cp ON cp."cardId" = c.id AND cp."userId" = ${userId}
      WHERE d."userId" = ${userId} AND (cp.id IS NULL OR cp."dueAt" <= ${now})
      GROUP BY c."deckId"
    `;
    // «Усвоено» = карточки, у которых серия верных ответов ≥ требуемого числа повторений колоды.
    const masteredRows = await context.db.$queryRaw<{ deckId: string; n: number }[]>`
      SELECT c."deckId" AS "deckId", count(*)::int AS n
      FROM "CardProgress" cp
      JOIN "Card" c ON c.id = cp."cardId"
      JOIN "Deck" d ON d.id = c."deckId"
      WHERE d."userId" = ${userId} AND cp."userId" = ${userId} AND cp.streak >= d."requiredCorrect"
      GROUP BY c."deckId"
    `;

    const dueByDeck = new Map(dueGroups.map((group) => [group.deckId, group.n]));
    const masteredByDeck = new Map(masteredRows.map((row) => [row.deckId, row.n]));

    return decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      description: deck.description,
      status: deck.status,
      exercisesStatus: deck.exercisesStatus,
      isPublic: deck.isPublic,
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
    const userId = context.session.user.id;
    const deck = await context.db.deck.findFirst({
      where: { id: data.id, ...accessibleDeckWhere(userId) },
      select: {
        id: true,
        title: true,
        description: true,
        requiredCorrect: true,
        status: true,
        generationError: true,
        exercisesStatus: true,
        exercisesError: true,
        isPublic: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true } },
        cards: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            question: true,
            answer: true,
            answerDeep: true,
            // Прогресс берём только текущего пользователя; стадия карточки считается по reps/intervalDays.
            progress: { where: { userId }, select: { reps: true, intervalDays: true } },
          },
        },
      },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }

    // Служебные поля генерации/заданий — только владельцу (добавившему в избранное они не нужны и не показываются).
    const isOwner = deck.userId === userId;

    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      requiredCorrect: deck.requiredCorrect,
      status: deck.status,
      generationError: isOwner ? deck.generationError : null,
      exercisesStatus: isOwner ? deck.exercisesStatus : "none",
      exercisesError: isOwner ? deck.exercisesError : null,
      isPublic: deck.isPublic,
      createdAt: deck.createdAt,
      isOwner,
      authorName: deck.user.name,
      cards: deck.cards.map((card) => {
        const progress = card.progress[0];
        return {
          id: card.id,
          question: card.question,
          answer: card.answer,
          answerDeep: card.answerDeep,
          reps: progress?.reps ?? 0,
          intervalDays: progress?.intervalDays ?? 0,
        };
      }),
    };
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
        requiredCorrect: data.requiredCorrect,
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

// Публикация колоды: делает её доступной по ссылке /d/:id. Снятие публикации отзывает доступ у избранного.
export const setDeckPublic = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), isPublic: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.deck.updateMany({
      where: { id: data.id, userId: context.session.user.id },
      data: { isPublic: data.isPublic },
    });
    if (result.count === 0) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    if (!data.isPublic) {
      await context.db.deckFavorite.deleteMany({ where: { deckId: data.id } });
    }
    return { isPublic: data.isPublic };
  });

// Публичная страница колоды по ссылке: доступна без входа (read-only превью). Сессию читаем опционально —
// чтобы показать кнопки «в избранное»/«открыть» в зависимости от того, кто смотрит.
export const getPublicDeck = createServerFn({ method: "GET" })
  .middleware([baseMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const session = await auth.api.getSession({ headers: new Headers(getRequestHeaders()) });
    const viewerId = session?.user.id ?? null;

    const deck = await context.db.deck.findFirst({
      where: { id: data.id },
      select: {
        id: true,
        title: true,
        description: true,
        isPublic: true,
        userId: true,
        user: { select: { name: true } },
        _count: { select: { cards: true } },
        // Превью: только первые N карточек и без answerDeep (глубинный разбор — самый дорогой контент,
        // он доступен только владельцу/добавившему в избранное через getDeckById, а не анонимам по ссылке).
        cards: { orderBy: { position: "asc" }, take: PUBLIC_PREVIEW_LIMIT, select: { id: true, question: true, answer: true } },
      },
    });
    const isOwner = !!viewerId && deck?.userId === viewerId;
    if (!deck || (!deck.isPublic && !isOwner)) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена или недоступна"));
    }

    let isFavorite = false;
    if (viewerId && !isOwner) {
      const favorite = await context.db.deckFavorite.findUnique({
        where: { userId_deckId: { userId: viewerId, deckId: deck.id } },
        select: { id: true },
      });
      isFavorite = Boolean(favorite);
    }

    return {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      authorName: deck.user.name,
      totalCards: deck._count.cards,
      cards: deck.cards,
      isOwner,
      isFavorite,
      isAuthenticated: Boolean(viewerId),
    };
  });

export const addFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, isPublic: true },
      select: { id: true, userId: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода недоступна для добавления"));
    }
    if (deck.userId === userId) {
      setResponseStatus(400);
      throw new Error(typo("Это ваша колода — она и так у вас есть"));
    }
    await context.db.deckFavorite.upsert({
      where: { userId_deckId: { userId, deckId: deck.id } },
      create: { userId, deckId: deck.id },
      update: {},
    });
    return true;
  });

export const removeFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    await context.db.deckFavorite.deleteMany({ where: { userId: context.session.user.id, deckId: data.deckId } });
    return true;
  });

export const getFavorites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const favorites = await context.db.deckFavorite.findMany({
      where: { userId, deck: { isPublic: true } },
      orderBy: { createdAt: "desc" },
      select: {
        deck: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            user: { select: { name: true } },
            _count: { select: { cards: true } },
          },
        },
      },
    });
    const decks = favorites.map((favorite) => favorite.deck);
    const deckIds = decks.map((deck) => deck.id);
    if (!deckIds.length) return [];

    const now = new Date();
    const dueGroups = await context.db.$queryRaw<{ deckId: string; n: number }[]>`
      SELECT c."deckId" AS "deckId", count(*)::int AS n
      FROM "Card" c
      LEFT JOIN "CardProgress" cp ON cp."cardId" = c.id AND cp."userId" = ${userId}
      WHERE c."deckId" = ANY(${deckIds}) AND (cp.id IS NULL OR cp."dueAt" <= ${now})
      GROUP BY c."deckId"
    `;
    const masteredRows = await context.db.$queryRaw<{ deckId: string; n: number }[]>`
      SELECT c."deckId" AS "deckId", count(*)::int AS n
      FROM "CardProgress" cp
      JOIN "Card" c ON c.id = cp."cardId"
      JOIN "Deck" d ON d.id = c."deckId"
      WHERE c."deckId" = ANY(${deckIds}) AND cp."userId" = ${userId} AND cp.streak >= d."requiredCorrect"
      GROUP BY c."deckId"
    `;
    const dueByDeck = new Map(dueGroups.map((group) => [group.deckId, group.n]));
    const masteredByDeck = new Map(masteredRows.map((row) => [row.deckId, row.n]));

    return decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      description: deck.description,
      status: deck.status,
      authorName: deck.user.name,
      totalCards: deck._count.cards,
      dueCount: dueByDeck.get(deck.id) ?? 0,
      masteredCount: masteredByDeck.get(deck.id) ?? 0,
    }));
  });

export type DeckListItem = Awaited<ReturnType<typeof getDecks>>[number];
export type DeckDetail = Awaited<ReturnType<typeof getDeckById>>;
export type DeckCard = DeckDetail["cards"][number];
export type FavoriteDeckItem = Awaited<ReturnType<typeof getFavorites>>[number];
