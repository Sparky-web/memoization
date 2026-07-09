import { queryOptions } from "@tanstack/react-query";

import { getAdminAccess } from "~/server/fn/admin";
import { getBillingStatus } from "~/server/fn/billing";
import { getDecks, getFavorites } from "~/server/fn/decks";

export type { DeckListItem, FavoriteDeckItem } from "~/server/fn/decks";

export const dashboardQueries = {
  // Статус подписки для пункта «Подписка» в меню пользователя.
  billing: () =>
    queryOptions({
      queryKey: ["billing", "status"],
      queryFn: () => getBillingStatus(),
    }),
  // Флаг администратора — только для пункта «Админка» в открытом меню пользователя.
  adminAccess: () =>
    queryOptions({
      queryKey: ["admin", "access"],
      queryFn: () => getAdminAccess(),
    }),
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
