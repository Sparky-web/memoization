import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { typo } from "~/lib";
import { addCard, deleteCard, updateCard } from "~/server/fn/cards";
import { deleteDeck, removeFavorite, retryGeneration, setDeckPublic, updateDeck } from "~/server/fn/decks";
import { generateDeckExercises } from "~/server/fn/exercises";
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

// Повторный запуск неудавшейся генерации колоды — по материалам, сохранённым на сервере.
export function useRetryGeneration(deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => retryGeneration({ data: { id: deckId } }),
    onSuccess: () => {
      toast.success(typo("Запустили генерацию заново"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось перезапустить генерацию"));
    },
  });
}

export function useGenerateExercises(deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => generateDeckExercises({ data: { deckId } }),
    onSuccess: () => {
      toast.success(typo("Запустили генерацию заданий и тестов"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось запустить генерацию заданий"));
    },
  });
}

// Публикация колоды (владелец): включает/выключает доступ по ссылке.
export function useShareDeck(deckId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isPublic: boolean) => setDeckPublic({ data: { id: deckId, isPublic } }),
    onSuccess: (result) => {
      toast.success(result.isPublic ? typo("Доступ по ссылке открыт") : typo("Доступ по ссылке закрыт"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось изменить доступ к колоде"));
    },
  });
}

// Убрать чужую колоду из избранного (на её странице) — после этого доступ к ней теряется, уходим на дашборд.
export function useRemoveFavorite(deckId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => removeFavorite({ data: { deckId } }),
    onSuccess: () => {
      toast.success(typo("Убрали из избранного"));
      void queryClient.invalidateQueries({ queryKey: DECKS_KEY });
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось убрать из избранного"));
    },
  });
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
