import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdaptiveGrid, Button, Heading, HStack, SimpleCard, Stat, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { DeckCard } from "./_lib/components/DeckCard";
import { dashboardQueries } from "./_lib/model/dashboardQueries";

export const Route = createFileRoute("/app/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueries.decks()),
  head: () => ({ meta: [{ title: typo("Колоды") }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const { data: decks } = useSuspenseQuery(dashboardQueries.decks());

  const totalCards = decks.reduce((sum, deck) => sum + deck.totalCards, 0);
  const dueTotal = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const masteredTotal = decks.reduce((sum, deck) => sum + deck.masteredCount, 0);

  const goToNewDeck = () => {
    void navigate({ to: "/app/decks/new" });
  };

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <Heading variant="h1">{typo("Мои колоды")}</Heading>
        <Button onClick={goToNewDeck}>{typo("Новая колода")}</Button>
      </HStack>

      {decks.length ? (
        <>
          <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
            <Stat label={typo("Колод")} value={decks.length} />
            <Stat label={typo("Карточек")} value={totalCards} />
            <Stat label={typo("К повторению")} value={dueTotal} />
            <Stat label={typo("Усвоено")} value={masteredTotal} />
          </AdaptiveGrid>

          <AdaptiveGrid cols={{ base: 1, md: 2, lg: 3 }} gap="md">
            {decks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </AdaptiveGrid>
        </>
      ) : (
        <SimpleCard title={typo("Пока нет ни одной колоды")} size="lg">
          <Text color="supplementary">
            {typo(
              "Создайте первую колоду: вставьте список вопросов через подготовленный промпт для Клода — и начните запоминать.",
            )}
          </Text>
          <HStack>
            <Button onClick={goToNewDeck}>{typo("Создать колоду")}</Button>
          </HStack>
        </SimpleCard>
      )}
    </VStack>
  );
}
