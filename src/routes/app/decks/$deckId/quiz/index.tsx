import { createFileRoute } from "@tanstack/react-router";

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
  return <QuizSession deckId={data.deckId} deckTitle={data.deckTitle} initialTasks={data.tasks} />;
}
