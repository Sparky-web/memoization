import "./instrument.server";

import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

import { typo } from "~/lib";
import { db } from "~/server/db";
import { refundUsage } from "~/server/usage";

// При старте контейнера сбрасываем «зависшие» генерации (claude-задание прервано рестартом)
// и возвращаем списанные попытки — прерванная рестартом генерация не должна сжигать лимит.
void db.deck
  .findMany({ where: { status: "processing" }, select: { id: true } })
  .then(async (stuckDecks) => {
    if (!stuckDecks.length) return;
    const stuckIds = stuckDecks.map((deck) => deck.id);
    await db.deck.updateMany({
      where: { id: { in: stuckIds } },
      data: { status: "failed", generationError: typo("Генерация прервана перезапуском сервера") },
    });
    await refundUsage(db, "deck_generation", stuckIds);
  })
  .catch(() => undefined);

// Аналогично — прерванная генерация заданий/тестов (у инлайновых проходов при создании
// колоды события exercise_generation нет — возврат удалит только реально списанные попытки).
void db.deck
  .findMany({ where: { exercisesStatus: "processing" }, select: { id: true } })
  .then(async (stuckDecks) => {
    if (!stuckDecks.length) return;
    const stuckIds = stuckDecks.map((deck) => deck.id);
    await db.deck.updateMany({
      where: { id: { in: stuckIds } },
      data: { exercisesStatus: "failed", exercisesError: typo("Генерация заданий прервана перезапуском сервера") },
    });
    await refundUsage(db, "exercise_generation", stuckIds);
  })
  .catch(() => undefined);

const fetch = createStartHandler(defaultStreamHandler);

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return fetch(request);
    },
  }),
);
