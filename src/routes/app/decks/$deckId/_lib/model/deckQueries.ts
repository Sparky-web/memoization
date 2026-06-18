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
    }),
  stats: (deckId: string) =>
    queryOptions({
      queryKey: ["decks", "stats", deckId],
      queryFn: () => getDeckStats({ data: { deckId } }),
    }),
};
