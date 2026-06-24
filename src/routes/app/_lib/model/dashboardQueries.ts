import { queryOptions } from "@tanstack/react-query";

import { getDecks, getFavorites } from "~/server/fn/decks";

export type { DeckListItem, FavoriteDeckItem } from "~/server/fn/decks";

export const dashboardQueries = {
  decks: () =>
    queryOptions({
      queryKey: ["decks", "list"],
      queryFn: () => getDecks(),
      // Пока идёт генерация колоды или заданий хотя бы у одной колоды — обновляем список.
      refetchInterval: (query) =>
        query.state.data?.some((deck) => deck.status === "processing" || deck.exercisesStatus === "processing")
          ? 4000
          : false,
    }),
  favorites: () =>
    queryOptions({
      queryKey: ["decks", "favorites"],
      queryFn: () => getFavorites(),
    }),
};
