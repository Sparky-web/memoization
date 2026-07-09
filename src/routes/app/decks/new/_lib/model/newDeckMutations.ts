import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { type ImportedDeck, isPaywallError, typo, zodRussian } from "~/lib";
import { createDeck } from "~/server/fn/decks";
import { logEvent } from "~/server/fn/events";

const generateResponseSchema = zodRussian.object({ deckId: zodRussian.string() });
const generateErrorSchema = zodRussian.object({ error: zodRussian.string() });

// Тело ошибки /api/generate: пейвол-код (PAYWALL_*) или русский текст (fair-use Pro).
// Кладём его в message — дальше клиент различает по isPaywallError/кириллице.
async function readGenerateError(response: Response): Promise<string> {
  try {
    const raw: unknown = await response.json();
    return generateErrorSchema.parse(raw).error;
  } catch {
    return "GENERATE_FAILED";
  }
}

/** Аналитика показа пейвола: слой components не зовёт server functions напрямую. */
export function reportPaywallShown(source: string): void {
  void logEvent({ data: { name: "paywall_shown", meta: { source } } }).catch(() => undefined);
}

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
      if (!response.ok) throw new Error(await readGenerateError(response));
      const raw: unknown = await response.json();
      return generateResponseSchema.parse(raw);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast.success(typo("Колода поставлена в очередь генерации"));
      void navigate({ to: "/app/decks/$deckId", params: { deckId: result.deckId } });
    },
    onError: (error) => {
      // Пейвол — не ошибка: форма сама покажет PaywallCard по generate.error.
      if (isPaywallError(error)) return;
      console.error(error);
      // Русский текст с сервера (fair-use лимит Pro) показываем как есть, коды — общей фразой.
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось запустить генерацию");
      toast.error(humanMessage);
    },
  });
}
