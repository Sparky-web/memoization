import { useNavigate } from "@tanstack/react-router";

import { Button, HStack, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { isPaywallError, typo } from "~/lib";

import { reportPaywallShown, useGenerateExercises } from "../model/deckMutations";

interface ExercisesPanelProps {
  deckId: string;
  fillCount: number;
  quizCount: number;
  exercisesStatus: string;
  exercisesError: string | null;
}

/** Блок «Тренажёр» на странице колоды: запуск режимов «Слова»/«Тесты» и генерация заданий. */
export function ExercisesPanel({ deckId, fillCount, quizCount, exercisesStatus, exercisesError }: ExercisesPanelProps) {
  const navigate = useNavigate();
  const generate = useGenerateExercises(deckId);

  const hasExercises = fillCount > 0 || quizCount > 0;
  const isProcessing = exercisesStatus === "processing";
  const isFailed = exercisesStatus === "failed";
  const isIdle = !hasExercises && !isProcessing && !isFailed;

  const goWords = () => {
    void navigate({ to: "/app/decks/$deckId/words", params: { deckId } });
  };
  const goQuiz = () => {
    void navigate({ to: "/app/decks/$deckId/quiz", params: { deckId } });
  };
  const startGenerate = () => {
    generate.mutate();
  };

  // 402 с кодом пейвола: бесплатная генерация тренажёров израсходована — предлагаем Pro.
  if (isPaywallError(generate.error, "EXERCISES")) {
    return (
      <SimpleCard title={typo("Тренажёр")}>
        <PaywallCard
          reason="EXERCISES"
          compact
          onShown={() => {
            reportPaywallShown("exercise_generation");
          }}
        />
      </SimpleCard>
    );
  }

  return (
    <SimpleCard title={typo("Тренажёр")}>
      {hasExercises && (
        <VStack gap="md">
          <Text color="supplementary">
            {typo(
              "Вставляйте пропущенные слова и проходите тесты — задания, на которых вы спотыкаетесь, показываем чаще.",
            )}
          </Text>
          <HStack gap="sm" wrap>
            <Button size="lg" disabled={fillCount === 0} onClick={goWords}>
              {typo(`Слова · ${fillCount}`)}
            </Button>
            <Button size="lg" variant="secondary" disabled={quizCount === 0} onClick={goQuiz}>
              {typo(`Тесты · ${quizCount}`)}
            </Button>
          </HStack>
          {isProcessing ? (
            <HStack gap="sm" align="center">
              <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <Text variant="small" color="supplementary">
                {typo("Обновляем набор заданий…")}
              </Text>
            </HStack>
          ) : (
            <Button variant="link" size="inline" disabled={generate.isPending} onClick={startGenerate}>
              {typo("Сгенерировать заново")}
            </Button>
          )}
        </VStack>
      )}

      {!hasExercises && isProcessing && (
        <HStack gap="sm" align="center">
          <div className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <Text color="supplementary">
            {typo(
              "Claude готовит задания «вставь слово» и тесты по колоде. Это займёт несколько минут — блок обновится сам.",
            )}
          </Text>
        </HStack>
      )}

      {!hasExercises && isFailed && (
        <VStack gap="sm">
          <Text color="destructive">{typo(exercisesError ?? "Не удалось сгенерировать задания")}</Text>
          <Button variant="outline" disabled={generate.isPending} onClick={startGenerate}>
            {typo("Повторить генерацию")}
          </Button>
        </VStack>
      )}

      {isIdle && (
        <VStack gap="sm">
          <Text color="supplementary">
            {typo("Сгенерируйте по этой колоде задания «вставь слово» и тесты — Claude составит их по карточкам.")}
          </Text>
          <Button disabled={generate.isPending} onClick={startGenerate}>
            {typo("Сгенерировать задания и тесты")}
          </Button>
        </VStack>
      )}
    </SimpleCard>
  );
}
