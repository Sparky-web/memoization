import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
  const router = useRouter();
  // «Начать заново» без перезагрузки страницы: лоадер перечитывает очередь, смена ключа сбрасывает стейт сессии.
  const [sessionKey, setSessionKey] = useState(0);

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
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      await router.invalidate();
      setSessionKey((key) => key + 1);
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
      key={sessionKey}
      deckId={data.deckId}
      deckTitle={data.deckTitle}
      requiredCorrect={data.requiredCorrect}
      isOwner={data.isOwner}
      initialCards={data.cards}
      onReview={handleReview}
      onRestart={handleRestart}
      restartPending={resetMutation.isPending}
    />
  );
}
