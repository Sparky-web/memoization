import { queryOptions } from "@tanstack/react-query";

import { getDecks } from "~/server/fn/decks";

export type { DeckListItem } from "~/server/fn/decks";

export const dashboardQueries = {
  decks: () =>
    queryOptions({
      queryKey: ["decks", "list"],
      queryFn: () => getDecks(),
    }),
};
