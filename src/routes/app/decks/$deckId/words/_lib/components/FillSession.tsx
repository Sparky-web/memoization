import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button, Heading, HStack, Input, PracticeFrame, PracticeSummary, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { type FillSessionTask, useFillAnswer, useFillDislike } from "../model/fillModel";

interface FillSessionProps {
  deckId: string;
  deckTitle: string;
  initialTasks: FillSessionTask[];
  /** «Ещё 20»: перезагрузка порции заданий без перезагрузки страницы (владелец — страница). */
  onRestart: () => void;
  restartPending: boolean;
}

interface FillResult {
  correct: boolean;
  answer: string;
}

const BLANK = "___";

type SlotState = "idle" | "correct" | "wrong";

function blankState(result: FillResult | null): SlotState {
  if (!result) return "idle";
  return result.correct ? "correct" : "wrong";
}

// Класс «слота» пропуска по состоянию ответа.
function slotClass(state: SlotState): string {
  if (state === "correct") return "border-success text-success";
  if (state === "wrong") return "border-destructive text-destructive";
  return "border-input text-muted-foreground";
}

// Класс чипа-варианта после ответа: правильный — зелёный, выбранный неверный — красный, прочие приглушены.
function optionClass(option: string, submitted: string | null, result: FillResult | null): string {
  if (!result) return "";
  if (option === result.answer) return "border-success text-success";
  if (option === submitted) return "border-destructive text-destructive";
  return "opacity-50";
}

export function FillSession({ deckId, deckTitle, initialTasks, onRestart, restartPending }: FillSessionProps) {
  const navigate = useNavigate();
  const answerMutation = useFillAnswer();
  const dislikeMutation = useFillDislike();

  const [queue, setQueue] = useState(initialTasks);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [mode, setMode] = useState<"choice" | "manual">("choice");
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [result, setResult] = useState<FillResult | null>(null);
  const [pending, setPending] = useState(false);
  const [goodPulse, setGoodPulse] = useState(0);

  const current = queue[index];
  const hasOptions = (current?.options.length ?? 0) >= 2;
  const effectiveMode = hasOptions ? mode : "manual";

  const goToDeck = () => {
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  const handleSubmit = (rawAnswer: string) => {
    if (result || pending || !current) return;
    const answer = rawAnswer.trim();
    if (!answer) return;
    setSubmitted(answer);
    setPending(true);
    answerMutation
      .mutateAsync({ taskId: current.id, answer })
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
        setSubmitted(null);
      });
  };

  const handleNext = () => {
    setIndex((value) => value + 1);
    setSubmitted(null);
    setResult(null);
    setInput("");
  };

  const handleDislike = () => {
    if (!current) return;
    dislikeMutation.mutate(current.id);
    // Удаляем текущее задание из очереди (следующее встаёт на его место).
    setQueue((tasks) => tasks.filter((_, position) => position !== index));
    setSubmitted(null);
    setResult(null);
    setInput("");
  };

  if (!initialTasks.length) {
    return (
      <VStack gap="md" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4 text-center">
        <Heading variant="h2" align="center">
          {typo("Заданий пока нет")}
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

  const blankIndex = current.prompt.indexOf(BLANK);
  const before = blankIndex >= 0 ? current.prompt.slice(0, blankIndex) : current.prompt;
  const after = blankIndex >= 0 ? current.prompt.slice(blankIndex + BLANK.length) : "";
  const slotState = blankState(result);

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

      <VStack gap="xl" justify="center" className="flex min-h-0 flex-1 rounded-3xl bg-card p-6 shadow-md">
        <Text variant="large" align="center">
          {before}
          <span
            className={`mx-1 inline-block min-w-16 border-b-2 px-1 text-center font-semibold ${slotClass(slotState)}`}
          >
            {submitted ?? "…"}
          </span>
          {after}
        </Text>

        {hasOptions && !result && (
          <HStack gap="2xs" justify="center">
            <Button
              variant={effectiveMode === "choice" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setMode("choice");
              }}
            >
              {typo("Варианты")}
            </Button>
            <Button
              variant={effectiveMode === "manual" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setMode("manual");
              }}
            >
              {typo("Ввести вручную")}
            </Button>
          </HStack>
        )}

        {effectiveMode === "choice" ? (
          <HStack gap="xs" wrap justify="center">
            {current.options.map((option, optionIndex) => (
              <Button
                key={`${optionIndex}-${option}`}
                variant="outline"
                size="sm"
                disabled={pending || Boolean(result)}
                className={optionClass(option, submitted, result)}
                onClick={() => {
                  handleSubmit(option);
                }}
              >
                {option}
              </Button>
            ))}
          </HStack>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit(input);
            }}
          >
            <HStack gap="sm" justify="center">
              <Input
                value={input}
                autoFocus
                disabled={pending || Boolean(result)}
                placeholder={typo("Введите слово")}
                onChange={(event) => {
                  setInput(event.target.value);
                }}
                className="max-w-xs"
              />
              <Button type="submit" disabled={pending || Boolean(result) || !input.trim()}>
                {typo("Проверить")}
              </Button>
            </HStack>
          </form>
        )}

        {result && (
          <VStack gap="sm" align="center">
            {result.correct ? (
              <Text align="center" bold>
                <span className="text-success">{typo("Верно!")}</span>
              </Text>
            ) : (
              <Text align="center" color="destructive">
                {`${typo("Правильный ответ:")} ${result.answer}`}
              </Text>
            )}
            <Button autoFocus onClick={handleNext}>
              {typo("Дальше")}
            </Button>
          </VStack>
        )}
      </VStack>
    </PracticeFrame>
  );
}
