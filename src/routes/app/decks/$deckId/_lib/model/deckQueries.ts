import { queryOptions } from "@tanstack/react-query";

import { getDeckById } from "~/server/fn/decks";
import { getDeckStats } from "~/server/fn/stats";

export type { DeckCard, DeckDetail } from "~/server/fn/decks";
export type { DeckStats } from "~/server/fn/stats";

/** Срез свежих detail-данных, по которому stats-запрос понимает, что должен их догнать. */
interface DeckDetailSnapshot {
  status: string;
  cardCount: number;
}

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
  stats: (deckId: string, detail?: DeckDetailSnapshot) =>
    queryOptions({
      queryKey: ["decks", "stats", deckId],
      queryFn: () => getDeckStats({ data: { deckId } }),
      // Сам по себе stats не поллится, но после окончания генерации должен догнать деталь:
      // пока totalCards отстаёт от свежего списка карточек detail-запроса — переопрашиваем,
      // иначе «Учить» и панель статистики остаются на нулях до истечения staleTime.
      refetchInterval: (query) => {
        const stats = query.state.data;
        if (!detail || !stats) return false;
        return detail.status === "ready" && stats.totalCards !== detail.cardCount ? 4000 : false;
      },
    }),
};
