import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { type ReviewGrade, typo } from "~/lib";
import { getStudyQueue, resetDeckProgress, reviewCard } from "~/server/fn/study";

import { StudySession } from "./_lib/components/StudySession";

export const Route = createFileRoute("/app/decks/$deckId/study/")({
  loader: ({ params }) => getStudyQueue({ data: { deckId: params.deckId } }),
  head: () => ({ meta: [{ title: typo("Повторение") }] }),
  component: StudyPage,
});

function StudyPage() {
  const data = Route.useLoaderData();
  const queryClient = useQueryClient();

  const reviewMutation = useMutation({
    mutationFn: (input: { cardId: string; grade: ReviewGrade }) => reviewCard({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить ответ"));
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetDeckProgress({ data: { deckId: data.deckId } }),
    onSuccess: () => {
      // Перезагружаем страницу — лоадер заберёт свежую очередь (все карточки снова due).
      window.location.reload();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось начать заново"));
    },
  });

  const handleReview = (cardId: string, grade: ReviewGrade) => reviewMutation.mutateAsync({ cardId, grade });
  const handleRestart = () => {
    resetMutation.mutate();
  };

  return (
    <StudySession
      deckId={data.deckId}
      deckTitle={data.deckTitle}
      requiredCorrect={data.requiredCorrect}
      initialCards={data.cards}
      onReview={handleReview}
      onRestart={handleRestart}
      restartPending={resetMutation.isPending}
    />
  );
}
