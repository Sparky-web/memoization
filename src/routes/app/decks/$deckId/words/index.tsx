import { createFileRoute } from "@tanstack/react-router";

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
  return <FillSession deckId={data.deckId} deckTitle={data.deckTitle} initialTasks={data.tasks} />;
}
