import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AddCardButton } from "./_lib/components/AddCardButton";
import { CardRow } from "./_lib/components/CardRow";
import { DeckHeader } from "./_lib/components/DeckHeader";
import { DeckStatsPanel } from "./_lib/components/DeckStatsPanel";
import { ExercisesPanel } from "./_lib/components/ExercisesPanel";
import { useResetDeck } from "./_lib/model/deckMutations";
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
  const reset = useResetDeck(deckId);

  const startStudy = () => {
    void navigate({ to: "/app/decks/$deckId/study", params: { deckId } });
  };

  return (
    <VStack gap="xl">
      <DeckHeader deck={deck} />

      {deck.status === "processing" && (
        <SimpleCard title={typo("Колода генерируется")}>
          <HStack gap="sm" align="center">
            <div className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <Text color="supplementary">
              {typo("Claude готовит карточки по вашим материалам. Это может занять несколько минут — страница обновится сама.")}
            </Text>
          </HStack>
        </SimpleCard>
      )}

      {deck.status === "failed" && (
        <SimpleCard title={typo("Не удалось сгенерировать")}>
          <Text color="destructive">{typo(deck.generationError ?? "Неизвестная ошибка")}</Text>
          <Text variant="small" color="supplementary">
            {typo("Удалите колоду и попробуйте снова — с другими материалами или вопросами.")}
          </Text>
        </SimpleCard>
      )}

      {deck.status === "ready" && (
        <>
          <DeckStatsPanel stats={stats} />
          <HStack gap="sm" wrap>
            <Button size="lg" disabled={stats.dueCards === 0} onClick={startStudy}>
              {stats.dueCards > 0 ? typo(`Учить · ${stats.dueCards}`) : typo("Всё повторено")}
            </Button>
            {stats.totalCards > 0 && (
              <Button
                size="lg"
                variant="outline"
                disabled={reset.isPending}
                onClick={() => {
                  reset.mutate();
                }}
              >
                {typo("Начать заново")}
              </Button>
            )}
          </HStack>

          <ExercisesPanel
            deckId={deckId}
            fillCount={stats.fillCount}
            quizCount={stats.quizCount}
            exercisesStatus={deck.exercisesStatus}
            exercisesError={deck.exercisesError}
          />

          <VStack gap="md">
            <Heading variant="h3">{typo(`Карточки · ${stats.totalCards}`)}</Heading>
            <AddCardButton deckId={deckId} />
            {deck.cards.length ? (
              <VStack gap="sm">
                {deck.cards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </VStack>
            ) : (
              <Text color="supplementary">
                {typo("В колоде пока нет карточек. Добавьте вручную или создайте новую колоду импортом или генерацией.")}
              </Text>
            )}
          </VStack>
        </>
      )}
    </VStack>
  );
}
