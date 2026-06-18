import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { type ImportedDeck, typo, zodRussian } from "~/lib";
import { createDeck } from "~/server/fn/decks";

const generateResponseSchema = zodRussian.object({ deckId: zodRussian.string() });

/** Ручной режим: создание колоды из распознанного JSON. */
export function useCreateDeck() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (payload: {
      title: string;
      description: string | null;
      requiredCorrect: number;
      cards: ImportedDeck["cards"];
    }) => createDeck({ data: payload }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast.success(typo("Колода создана"));
      void navigate({ to: "/app/decks/$deckId", params: { deckId: result.id } });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось создать колоду"));
    },
  });
}

/** Режим генерации: отправка материалов/вопросов на /api/generate (claude -p в фоне). */
export function useGenerateDeck() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (form: FormData) => {
      const response = await fetch("/api/generate", { method: "POST", body: form });
      if (!response.ok) throw new Error("GENERATE_FAILED");
      const raw: unknown = await response.json();
      return generateResponseSchema.parse(raw);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast.success(typo("Колода поставлена в очередь генерации"));
      void navigate({ to: "/app/decks/$deckId", params: { deckId: result.deckId } });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось запустить генерацию"));
    },
  });
}
