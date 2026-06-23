import { queryOptions } from "@tanstack/react-query";

import { getDeckById } from "~/server/fn/decks";
import { getDeckStats } from "~/server/fn/stats";

export type { DeckCard, DeckDetail } from "~/server/fn/decks";
export type { DeckStats } from "~/server/fn/stats";

export const deckQueries = {
  detail: (deckId: string) =>
    queryOptions({
      queryKey: ["decks", "detail", deckId],
      queryFn: () => getDeckById({ data: { id: deckId } }),
      // Пока идёт генерация колоды ИЛИ заданий — опрашиваем статус, чтобы экран обновился сам.
      refetchInterval: (query) => {
        const deck = query.state.data;
        return deck?.status === "processing" || deck?.exercisesStatus === "processing" ? 4000 : false;
      },
    }),
  stats: (deckId: string) =>
    queryOptions({
      queryKey: ["decks", "stats", deckId],
      queryFn: () => getDeckStats({ data: { deckId } }),
    }),
};
