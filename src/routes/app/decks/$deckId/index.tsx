import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button, ConfirmDialog, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AddCardButton } from "./_lib/components/AddCardButton";
import { CardRow } from "./_lib/components/CardRow";
import { DeckHeader } from "./_lib/components/DeckHeader";
import { DeckStatsPanel } from "./_lib/components/DeckStatsPanel";
import { ExercisesPanel } from "./_lib/components/ExercisesPanel";
import { useResetDeck, useRetryGeneration } from "./_lib/model/deckMutations";
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

// Текст статуса генерации: позиция в очереди или «генерируется сейчас».
function processingMessage(queuePosition: number | null): string {
  if (queuePosition && queuePosition > 0) {
    return typo(`В очереди: ${queuePosition}-я. Claude обрабатывает колоды по одной — страница обновится сама.`);
  }
  return typo(
    "Claude готовит карточки по вашим материалам. Это может занять несколько минут — страница обновится сама.",
  );
}

function DeckDetailPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const { data: deck } = useSuspenseQuery(deckQueries.detail(deckId));
  const { data: stats } = useSuspenseQuery(deckQueries.stats(deckId));
  const reset = useResetDeck(deckId);
  const retry = useRetryGeneration(deckId);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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
            <Text color="supplementary">{processingMessage(deck.queuePosition)}</Text>
          </HStack>
        </SimpleCard>
      )}

      {deck.status === "failed" && (
        <SimpleCard title={typo("Не удалось сгенерировать")}>
          <Text color="destructive">{typo(deck.generationError ?? "Неизвестная ошибка")}</Text>
          {deck.canRetryGeneration ? (
            <VStack gap="sm">
              <Text variant="small" color="supplementary">
                {typo("Материалы сохранились — можно запустить генерацию ещё раз без повторной загрузки.")}
              </Text>
              <HStack>
                <Button
                  disabled={retry.isPending}
                  onClick={() => {
                    retry.mutate();
                  }}
                >
                  {typo("Повторить генерацию")}
                </Button>
              </HStack>
            </VStack>
          ) : (
            <Text variant="small" color="supplementary">
              {typo("Удалите колоду и попробуйте снова — с другими материалами или вопросами.")}
            </Text>
          )}
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
                  setResetConfirmOpen(true);
                }}
              >
                {typo("Начать заново")}
              </Button>
            )}
          </HStack>

          <ConfirmDialog
            open={resetConfirmOpen}
            onOpenChange={setResetConfirmOpen}
            title={typo("Начать заново?")}
            description={typo(
              "Прогресс повторений по всем карточкам колоды будет сброшен — они снова станут новыми. Статистика повторений сохранится.",
            )}
            confirmLabel={typo("Сбросить прогресс")}
            confirmPending={reset.isPending}
            onConfirm={() => {
              setResetConfirmOpen(false);
              reset.mutate();
            }}
          />

          {deck.isOwner && (
            <ExercisesPanel
              deckId={deckId}
              fillCount={stats.fillCount}
              quizCount={stats.quizCount}
              exercisesStatus={deck.exercisesStatus}
              exercisesError={deck.exercisesError}
            />
          )}

          <VStack gap="md">
            <Heading variant="h3">{typo(`Карточки · ${stats.totalCards}`)}</Heading>
            {deck.isOwner && <AddCardButton deckId={deckId} />}
            {deck.cards.length ? (
              <VStack gap="sm">
                {deck.cards.map((card) => (
                  <CardRow key={card.id} card={card} canEdit={deck.isOwner} />
                ))}
              </VStack>
            ) : (
              <Text color="supplementary">
                {typo(
                  "В колоде пока нет карточек. Добавьте вручную или создайте новую колоду импортом или генерацией.",
                )}
              </Text>
            )}
          </VStack>
        </>
      )}
    </VStack>
  );
}
