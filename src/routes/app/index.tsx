import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AdaptiveGrid, Button, Heading, HStack, SimpleCard, Stat, Text, VStack } from "~/components";
import { typo } from "~/lib";
import { generateMissingExercises } from "~/server/fn/exercises";

import { DeckCard } from "./_lib/components/DeckCard";
import { FavoriteDeckCard } from "./_lib/components/FavoriteDeckCard";
import { dashboardQueries } from "./_lib/model/dashboardQueries";

export const Route = createFileRoute("/app/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQueries.decks()),
      context.queryClient.ensureQueryData(dashboardQueries.favorites()),
    ]),
  head: () => ({ meta: [{ title: typo("Колоды") }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: decks } = useSuspenseQuery(dashboardQueries.decks());
  const { data: favorites } = useSuspenseQuery(dashboardQueries.favorites());

  const totalCards = decks.reduce((sum, deck) => sum + deck.totalCards, 0);
  const dueTotal = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const masteredTotal = decks.reduce((sum, deck) => sum + deck.masteredCount, 0);

  // Колоды без заданий тренажёра — кандидаты на догенерацию.
  const needBackfill = decks.filter(
    (deck) => deck.totalCards > 0 && (deck.exercisesStatus === "none" || deck.exercisesStatus === "failed"),
  ).length;
  const anyExercisesProcessing = decks.some((deck) => deck.exercisesStatus === "processing");

  const backfill = useMutation({
    mutationFn: () => generateMissingExercises(),
    onSuccess: (result) => {
      if (result.queued) {
        toast.success(typo(`Запустили генерацию заданий: ${result.queued}`));
      } else {
        toast.success(typo("Задания уже сгенерированы для всех колод"));
      }
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось запустить генерацию заданий"));
    },
  });

  const goToNewDeck = () => {
    void navigate({ to: "/app/decks/new" });
  };

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <Heading variant="h1">{typo("Мои колоды")}</Heading>
        <HStack gap="sm" wrap>
          {needBackfill > 0 && (
            <Button
              variant="outline"
              disabled={backfill.isPending}
              onClick={() => {
                backfill.mutate();
              }}
            >
              {typo(`Сгенерировать задания · ${needBackfill}`)}
            </Button>
          )}
          <Button onClick={goToNewDeck}>{typo("Новая колода")}</Button>
        </HStack>
      </HStack>

      {anyExercisesProcessing && (
        <Text variant="small" color="supplementary">
          {typo("Задания «вставь слово» и тесты генерируются в фоне — это займёт несколько минут.")}
        </Text>
      )}

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

      {favorites.length ? (
        <VStack gap="md">
          <Heading variant="h2">{typo("Избранное")}</Heading>
          <Text variant="small" color="supplementary">
            {typo("Чужие колоды, которыми с вами поделились. Вы учите их со своим прогрессом.")}
          </Text>
          <AdaptiveGrid cols={{ base: 1, md: 2, lg: 3 }} gap="md">
            {favorites.map((deck) => (
              <FavoriteDeckCard key={deck.id} deck={deck} />
            ))}
          </AdaptiveGrid>
        </VStack>
      ) : null}
    </VStack>
  );
}
