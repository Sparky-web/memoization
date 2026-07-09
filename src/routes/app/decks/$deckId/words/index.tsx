import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { typo } from "~/lib";
import { getFillSession } from "~/server/fn/exercises";

import { FillSession } from "./_lib/components/FillSession";

export const Route = createFileRoute("/app/decks/$deckId/words/")({
  loader: ({ params }) => getFillSession({ data: { deckId: params.deckId } }),
  head: () => ({ meta: [{ title: typo("Слова") }] }),
  component: WordsPage,
});

function WordsPage() {
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
    <FillSession
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
