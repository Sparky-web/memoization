import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdaptiveGrid, Button, Heading, HStack, Input, SimpleCard, Stat, Text, VStack } from "~/components";
import { isPaywallError, typo } from "~/lib";
import { generateMissingExercises } from "~/server/fn/exercises";

import { DeckCard } from "./_lib/components/DeckCard";
import { FavoriteDeckCard } from "./_lib/components/FavoriteDeckCard";
import { dashboardQueries, type DeckListItem } from "./_lib/model/dashboardQueries";

type DeckSort = "activity" | "alpha" | "due";

const sortOptions: { value: DeckSort; label: string }[] = [
  { value: "activity", label: typo("По активности") },
  { value: "alpha", label: typo("По алфавиту") },
  { value: "due", label: typo("К повторению") },
];

// «Активность» колоды — последнее повторение, а до первого повторения — момент создания.
function activityTime(deck: DeckListItem): number {
  return new Date(deck.lastStudiedAt ?? deck.createdAt).getTime();
}

const deckComparators: Record<DeckSort, (left: DeckListItem, right: DeckListItem) => number> = {
  activity: (left, right) => activityTime(right) - activityTime(left),
  alpha: (left, right) => left.title.localeCompare(right.title, "ru"),
  due: (left, right) => right.dueCount - left.dueCount,
};

function matchesSearch(deck: DeckListItem, query: string): boolean {
  if (deck.title.toLowerCase().includes(query)) return true;
  return Boolean(deck.description?.toLowerCase().includes(query));
}

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

  // Поиск и сортировка — клиентские; управление показываем, когда колод становится много.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DeckSort>("activity");
  const showControls = decks.length > 5;
  const query = search.trim().toLowerCase();
  const filteredDecks = query ? decks.filter((deck) => matchesSearch(deck, query)) : decks;
  const visibleDecks = [...filteredDecks].sort(deckComparators[sort]);

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
      // Бесплатная генерация тренажёров израсходована — ведём на тарифы вместо тоста-ошибки.
      if (isPaywallError(error, "EXERCISES")) {
        toast.info(typo("Генерация тренажёров для всех колод — в Pro"));
        void navigate({ to: "/pricing" });
        return;
      }
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

          {showControls && (
            <HStack gap="sm" align="center" wrap>
              <Input
                value={search}
                placeholder={typo("Поиск по колодам")}
                className="max-w-xs"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
              <HStack gap="2xs" wrap>
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={sort === option.value ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setSort(option.value);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </HStack>
            </HStack>
          )}

          {visibleDecks.length ? (
            <AdaptiveGrid cols={{ base: 1, md: 2, lg: 3 }} gap="md">
              {visibleDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} />
              ))}
            </AdaptiveGrid>
          ) : (
            <Text color="supplementary">{typo("По запросу ничего не нашлось — попробуйте другое слово.")}</Text>
          )}
        </>
      ) : (
        <SimpleCard title={typo("Создайте первую колоду")} size="lg">
          <Text color="supplementary">
            {typo(
              "Загрузите конспект или список экзаменационных вопросов — Claude сам сделает карточки с ответами, задания «вставь слово» и тесты. Останется только повторять.",
            )}
          </Text>
          <HStack>
            <Button size="lg" onClick={goToNewDeck}>
              {typo("Создать первую колоду")}
            </Button>
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
