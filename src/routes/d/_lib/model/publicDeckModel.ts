import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { typo } from "~/lib";
import { addFavorite, getPublicDeck } from "~/server/fn/decks";

export const publicDeckQueries = {
  detail: (deckId: string) =>
    queryOptions({
      queryKey: ["public-deck", deckId],
      queryFn: () => getPublicDeck({ data: { id: deckId } }),
    }),
};

// Добавление публичной колоды в избранное со страницы-ссылки: после успеха ведём в раздел учёбы.
export function useAddFavorite(deckId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => addFavorite({ data: { deckId } }),
    onSuccess: () => {
      toast.success(typo("Добавили в избранное"));
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["public-deck", deckId] });
      void navigate({ to: "/app/decks/$deckId", params: { deckId } });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось добавить в избранное"));
    },
  });
}
