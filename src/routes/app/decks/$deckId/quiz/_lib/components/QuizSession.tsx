import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button, Heading, MarkdownView, PracticeFrame, PracticeSummary, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { type QuizSessionTask, useQuizAnswer, useQuizDislike } from "../model/quizModel";

interface QuizSessionProps {
  deckId: string;
  deckTitle: string;
  initialTasks: QuizSessionTask[];
  /** «Ещё 20»: перезагрузка порции вопросов без перезагрузки страницы (владелец — страница). */
  onRestart: () => void;
  restartPending: boolean;
}

interface QuizResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string | null;
}

// Класс варианта после ответа: правильный — зелёный, выбранный неверный — красный, прочие приглушены.
function optionClass(option: string, selected: string | null, result: QuizResult | null): string {
  if (!result) return "w-full justify-start text-left";
  if (option === result.correctAnswer) return "w-full justify-start text-left border-success text-success";
  if (option === selected) return "w-full justify-start text-left border-destructive text-destructive";
  return "w-full justify-start text-left opacity-50";
}

export function QuizSession({ deckId, deckTitle, initialTasks, onRestart, restartPending }: QuizSessionProps) {
  const navigate = useNavigate();
  const answerMutation = useQuizAnswer();
  const dislikeMutation = useQuizDislike();

  const [queue, setQueue] = useState(initialTasks);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [pending, setPending] = useState(false);
  const [goodPulse, setGoodPulse] = useState(0);

  const current = queue[index];

  const goToDeck = () => {
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  const handleSelect = (option: string) => {
    if (result || pending || !current) return;
    setSelected(option);
    setPending(true);
    answerMutation
      .mutateAsync({ taskId: current.id, answer: option })
      .then((response) => {
        setResult(response);
        setPending(false);
        setAnswered((value) => value + 1);
        if (response.correct) {
          setCorrect((value) => value + 1);
          setGoodPulse((value) => value + 1);
        }
      })
      .catch(() => {
        setPending(false);
        setSelected(null);
      });
  };

  const handleNext = () => {
    setIndex((value) => value + 1);
    setSelected(null);
    setResult(null);
  };

  const handleDislike = () => {
    if (!current) return;
    dislikeMutation.mutate(current.id);
    setQueue((tasks) => tasks.filter((_, position) => position !== index));
    setSelected(null);
    setResult(null);
  };

  if (!initialTasks.length) {
    return (
      <VStack gap="md" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4 text-center">
        <Heading variant="h2" align="center">
          {typo("Тестов пока нет")}
        </Heading>
        <Text color="supplementary" align="center">
          {typo("Сгенерируйте задания на странице колоды и возвращайтесь.")}
        </Text>
        <Button variant="outline" onClick={goToDeck}>
          {typo("К колоде")}
        </Button>
      </VStack>
    );
  }

  if (!current) {
    return (
      <PracticeSummary
        answered={answered}
        correct={correct}
        onRestart={onRestart}
        restartPending={restartPending}
        onExit={goToDeck}
      />
    );
  }

  return (
    <PracticeFrame
      deckTitle={deckTitle}
      answered={answered}
      total={queue.length}
      onExit={goToDeck}
      onDislike={result ? undefined : handleDislike}
    >
      {goodPulse > 0 && (
        <div
          key={goodPulse}
          aria-hidden
          className="good-pulse pointer-events-none fixed inset-0 z-50"
          style={{ background: "radial-gradient(circle at 50% 45%, var(--success), transparent 60%)" }}
        />
      )}

      <VStack gap="lg" className="min-h-0 flex-1 overflow-y-auto rounded-3xl bg-card p-6 shadow-md">
        <MarkdownView>{current.question}</MarkdownView>

        <VStack gap="sm">
          {current.options.map((option, optionIndex) => (
            <Button
              key={`${optionIndex}-${option}`}
              variant="outline"
              disabled={pending || Boolean(result)}
              className={optionClass(option, selected, result)}
              onClick={() => {
                handleSelect(option);
              }}
            >
              {option}
            </Button>
          ))}
        </VStack>

        {result && (
          <VStack gap="sm">
            {result.explanation ? (
              <div className="rounded-xl bg-muted p-3">
                <MarkdownView>{result.explanation}</MarkdownView>
              </div>
            ) : null}
            <Button autoFocus onClick={handleNext}>
              {typo("Дальше")}
            </Button>
          </VStack>
        )}
      </VStack>
    </PracticeFrame>
  );
}
