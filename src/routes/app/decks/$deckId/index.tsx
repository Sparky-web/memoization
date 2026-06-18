import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button, Heading, HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AddCardForm } from "./_lib/components/AddCardForm";
import { CardRow } from "./_lib/components/CardRow";
import { DeckHeader } from "./_lib/components/DeckHeader";
import { DeckStatsPanel } from "./_lib/components/DeckStatsPanel";
import { deckQueries } from "./_lib/model/deckQueries";

export const Route = createFileRoute("/app/decks/$deckId/")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(deckQueries.detail(params.deckId)),
      context.queryClient.ensureQueryData(deckQueries.stats(params.deckId)),
    ]),
  head: () => ({ meta: [{ title: typo("Колода") }] }),
  component: DeckDetailPage,
});

function DeckDetailPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const { data: deck } = useSuspenseQuery(deckQueries.detail(deckId));
  const { data: stats } = useSuspenseQuery(deckQueries.stats(deckId));

  const startStudy = () => {
    void navigate({ to: "/app/decks/$deckId/study", params: { deckId } });
  };

  return (
    <VStack gap="xl">
      <DeckHeader deck={deck} />
      <DeckStatsPanel stats={stats} />
      <HStack>
        <Button size="lg" onClick={startStudy} disabled={stats.dueCards === 0}>
          {stats.dueCards > 0 ? typo(`Учить · ${stats.dueCards} к повторению`) : typo("На сегодня всё повторено")}
        </Button>
      </HStack>
      <VStack gap="md">
        <Heading variant="h3">{typo(`Карточки · ${stats.totalCards}`)}</Heading>
        <AddCardForm deckId={deckId} />
        {deck.cards.length ? (
          <VStack gap="sm">
            {deck.cards.map((card) => (
              <CardRow key={card.id} card={card} />
            ))}
          </VStack>
        ) : (
          <Text color="supplementary">{typo("В колоде пока нет карточек. Добавьте вручную или создайте новую колоду импортом.")}</Text>
        )}
      </VStack>
    </VStack>
  );
}
