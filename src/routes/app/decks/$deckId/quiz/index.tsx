import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { typo } from "~/lib";
import { getQuizSession } from "~/server/fn/exercises";

import { QuizSession } from "./_lib/components/QuizSession";

export const Route = createFileRoute("/app/decks/$deckId/quiz/")({
  loader: ({ params }) => getQuizSession({ data: { deckId: params.deckId } }),
  head: () => ({ meta: [{ title: typo("Тесты") }] }),
  component: QuizPage,
});

function QuizPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  // «Ещё 20» без перезагрузки страницы: лоадер перечитывает порцию, смена ключа сбрасывает стейт сессии.
  const [sessionKey, setSessionKey] = useState(0);
  const [restarting, setRestarting] = useState(false);

  const restart = async () => {
    setRestarting(true);
    try {
      await router.invalidate();
      setSessionKey((key) => key + 1);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <QuizSession
      key={sessionKey}
      deckId={data.deckId}
      deckTitle={data.deckTitle}
      initialTasks={data.tasks}
      restartPending={restarting}
      onRestart={() => {
        void restart();
      }}
    />
  );
}
