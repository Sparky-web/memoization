import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { type ReviewGrade, typo } from "~/lib";
import { getStudyQueue, reviewCard } from "~/server/fn/study";

import { StudySession } from "./_lib/components/StudySession";

export const Route = createFileRoute("/app/decks/$deckId/study/")({
  validateSearch: (search: Record<string, unknown>): { mode: "short" | "deep" } => ({
    mode: search.mode === "deep" ? "deep" : "short",
  }),
  loader: ({ params }) => getStudyQueue({ data: { deckId: params.deckId } }),
  head: () => ({ meta: [{ title: typo("Повторение") }] }),
  component: StudyPage,
});

function StudyPage() {
  const data = Route.useLoaderData();
  const { mode } = Route.useSearch();
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: (input: { cardId: string; grade: ReviewGrade }) => reviewCard({ data: input }),
    onSuccess: () => {
      // Прогресс изменился — помечаем устаревшими дашборд, деталь колоды и статистику.
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить ответ"));
    },
  });

  // Возвращаем промис: StudySession откатит оптимистичное обновление, если ответ не сохранится.
  const handleReview = (cardId: string, grade: ReviewGrade) => reviewMutation.mutateAsync({ cardId, grade });

  return (
    <StudySession
      deckId={data.deckId}
      deckTitle={data.deckTitle}
      requiredCorrect={data.requiredCorrect}
      mode={mode}
      initialCards={data.cards}
      onReview={handleReview}
    />
  );
}
