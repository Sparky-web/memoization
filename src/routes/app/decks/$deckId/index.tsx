import { createFileRoute, redirect } from "@tanstack/react-router";

// Старые ссылки на колоды живут: id экзаменов совпадают с id колод после миграции.
export const Route = createFileRoute("/app/decks/$deckId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/exams/$examId", params: { examId: params.deckId } });
  },
});
