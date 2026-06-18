import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { typo } from "~/lib";
import { addCard, deleteCard, updateCard } from "~/server/fn/cards";
import { deleteDeck, updateDeck } from "~/server/fn/decks";
import { resetDeckProgress } from "~/server/fn/study";

// Все мутации инвалидируют корневой ключ ["decks"] — он покрывает список, деталь и статистику.
const DECKS_KEY = ["decks"];

interface CardFields {
  question: string;
  answer: string;
  answerDeep: string | null;
}

export function useAddCard(deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CardFields) => addCard({ data: { deckId, data } }),
    onSuccess: () => {
      toast.success(typo("Карточка добавлена"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось добавить карточку"));
    },
  });
}

export function useCardEditor() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: DECKS_KEY });

  const update = useMutation({
    mutationFn: (input: { id: string; data: CardFields }) => updateCard({ data: input }),
    onSuccess: () => {
      toast.success(typo("Карточка обновлена"));
      void invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить изменения"));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCard({ data: { id } }),
    onSuccess: () => {
      toast.success(typo("Карточка удалена"));
      void invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить карточку"));
    },
  });

  return { update, remove };
}

export function useDeckActions(deckId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: DECKS_KEY });

  const rename = useMutation({
    mutationFn: (data: { title: string; description: string | null; requiredCorrect: number }) =>
      updateDeck({ data: { id: deckId, data } }),
    onSuccess: () => {
      toast.success(typo("Колода обновлена"));
      void invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось обновить колоду"));
    },
  });

  const removeDeck = useMutation({
    mutationFn: () => deleteDeck({ data: { id: deckId } }),
    onSuccess: () => {
      toast.success(typo("Колода удалена"));
      void invalidate();
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить колоду"));
    },
  });

  return { rename, removeDeck };
}

export function useResetDeck(deckId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => resetDeckProgress({ data: { deckId } }),
    onSuccess: () => {
      toast.success(typo("Прогресс сброшен — начинаем заново"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
      void navigate({ to: "/app/decks/$deckId/study", params: { deckId } });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сбросить прогресс"));
    },
  });
}
