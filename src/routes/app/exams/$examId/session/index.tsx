import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Heading, HStack, Input, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { isPaywallError, typo, zodRussian } from "~/lib";
import { answerCard, type AnswerResult, type SessionCard, startSession, submitOpenRating } from "~/server/fn/session";

// Временный плеер волны 1: очередь с сервера, ответы без подсказок, самооценка для открытых.
// Полный плеер (уверенность до ответа, precall-таймер, анимации, интерливинг-подписи) — волна 3.

const searchSchema = zodRussian.object({
  kind: zodRussian.enum(["daily", "pretest", "bedtime", "cram"]).catch("daily"),
});

export const Route = createFileRoute("/app/exams/$examId/session/")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({ meta: [{ title: typo("Сессия") }] }),
  component: SessionPage,
});

const RATING_LABELS: { rating: 1 | 2 | 3 | 4; label: string }[] = [
  { rating: 1, label: typo("Не вспомнил") },
  { rating: 2, label: typo("С трудом") },
  { rating: 3, label: typo("Вспомнил") },
  { rating: 4, label: typo("Легко") },
];

function kindTitle(kind: "daily" | "pretest" | "bedtime" | "cram"): string {
  const titles: Record<typeof kind, string> = {
    daily: typo("Дневная сессия"),
    pretest: typo("Претест: сначала бой"),
    bedtime: typo("Перед сном"),
    cram: typo("Умная зубрёжка"),
  };
  return titles[kind];
}

function CardPlayer({
  card,
  kind,
  onDone,
}: {
  card: SessionCard;
  kind: "daily" | "pretest" | "bedtime" | "cram";
  onDone: (correct: boolean | null) => void;
}) {
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [typed, setTyped] = useState("");

  const answer = useMutation({
    mutationFn: (input: { selectedOption?: string; answerText?: string; boolAnswer?: boolean }) =>
      answerCard({ data: { cardId: card.id, kind, ...input } }),
    onSuccess: setResult,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось отправить ответ"));
    },
  });

  const rate = useMutation({
    mutationFn: (rating: 1 | 2 | 3 | 4) => submitOpenRating({ data: { cardId: card.id, kind, rating } }),
    onSuccess: (graded) => {
      onDone(graded.correct);
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить оценку"));
    },
  });

  // Фаза припоминания: ответ не показан, ввод зависит от формата.
  if (!result) {
    return (
      <SimpleCard size="lg">
        <VStack gap="md">
          {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
          <Heading variant="h3" asParagraph>
            {typo(card.prompt)}
          </Heading>
          <Text variant="mini" color="supplementary">
            {typo("Сначала вспомните ответ сами — потом отвечайте.")}
          </Text>

          {card.format === "open" && (
            <HStack>
              <Button
                disabled={answer.isPending}
                onClick={() => {
                  answer.mutate({});
                }}
              >
                {typo("Показать ответ")}
              </Button>
            </HStack>
          )}

          {(card.format === "mcq" || (card.format === "cloze" && card.options.length > 0)) && (
            <VStack gap="2xs">
              {card.options.map((option) => (
                <Button
                  key={option}
                  variant="outline"
                  disabled={answer.isPending}
                  className="justify-start whitespace-normal text-left"
                  onClick={() => {
                    answer.mutate({ selectedOption: option });
                  }}
                >
                  {typo(option)}
                </Button>
              ))}
            </VStack>
          )}

          {card.format === "cloze" && !card.options.length && (
            <HStack gap="sm" align="center" wrap>
              <Input
                value={typed}
                placeholder={typo("Пропущенное слово")}
                className="max-w-xs"
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
              <Button
                disabled={answer.isPending || !typed.trim()}
                onClick={() => {
                  answer.mutate({ answerText: typed.trim() });
                }}
              >
                {typo("Ответить")}
              </Button>
            </HStack>
          )}

          {card.format === "truefalse" && (
            <HStack gap="sm" wrap>
              <Button
                variant="outline"
                disabled={answer.isPending}
                onClick={() => {
                  answer.mutate({ boolAnswer: true });
                }}
              >
                {typo("Верно")}
              </Button>
              <Button
                variant="outline"
                disabled={answer.isPending}
                onClick={() => {
                  answer.mutate({ boolAnswer: false });
                }}
              >
                {typo("Неверно")}
              </Button>
            </HStack>
          )}
        </VStack>
      </SimpleCard>
    );
  }

  // Фаза обратной связи: эталон + пояснение; открытый формат просит самооценку.
  const isOpenReveal = result.correct === null;
  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <Heading variant="h3" asParagraph>
          {typo(card.prompt)}
        </Heading>
        {!isOpenReveal && (
          <Badge variant={result.correct ? "primary" : "muted"}>
            {result.correct ? typo("Верно") : typo("Мимо — ничего страшного")}
          </Badge>
        )}
        <VStack gap="2xs">
          <Text variant="mini" color="supplementary">
            {typo("Эталонный ответ")}
          </Text>
          <Text bold breakWords>
            {typo(result.answer)}
          </Text>
          {result.explanation && (
            <Text variant="small" color="supplementary" breakWords>
              {typo(result.explanation)}
            </Text>
          )}
          {result.sourceRef && (
            <Text variant="mini" color="supplementary">
              {typo(`Из твоего конспекта: ${result.sourceRef}`)}
            </Text>
          )}
        </VStack>

        {isOpenReveal ? (
          <VStack gap="2xs">
            <Text variant="mini" color="supplementary">
              {typo("Насколько точно вспомнили?")}
            </Text>
            <HStack gap="2xs" wrap>
              {RATING_LABELS.map((option) => (
                <Button
                  key={option.rating}
                  variant="outline"
                  size="sm"
                  disabled={rate.isPending}
                  onClick={() => {
                    rate.mutate(option.rating);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </HStack>
          </VStack>
        ) : (
          <HStack>
            <Button
              onClick={() => {
                onDone(result.correct);
              }}
            >
              {typo("Дальше")}
            </Button>
          </HStack>
        )}
      </VStack>
    </SimpleCard>
  );
}

function SessionPage() {
  const { examId } = Route.useParams();
  const { kind } = Route.useSearch();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const session = useQuery({
    queryKey: ["session", examId, kind],
    queryFn: () => startSession({ data: { examId, kind } }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (session.isLoading) {
    return <Text color="supplementary">{typo("Собираем очередь…")}</Text>;
  }
  if (session.error) {
    if (isPaywallError(session.error, "CRAM")) {
      return <PaywallCard reason="CRAM" />;
    }
    return <Text color="supplementary">{typo("Не удалось начать сессию — вернитесь к экзамену.")}</Text>;
  }
  const queue = session.data;
  if (!queue) return null;

  const card = queue.cards[index];
  const finished = !queue.cards.length || !card;

  return (
    <VStack gap="lg">
      <HStack justify="between" align="center" gap="md" wrap>
        <VStack gap="3xs">
          <Heading variant="h2">{kindTitle(kind)}</Heading>
          <Text variant="small" color="supplementary">
            {typo(queue.examTitle)}
          </Text>
        </VStack>
        <Text variant="small" color="supplementary">
          {typo(`${Math.min(index + 1, queue.cards.length)} из ${queue.cards.length}`)}
        </Text>
      </HStack>

      {finished ? (
        <SimpleCard size="lg" title={queue.cards.length ? typo("Сессия завершена") : typo("Сейчас повторять нечего")}>
          {queue.cards.length ? (
            <Text color="supplementary">
              {typo(`Отвечено карточек: ${queue.cards.length}, верно: ${correctCount}.`)}
            </Text>
          ) : (
            <Text color="supplementary">
              {typo("Все карточки повторены вовремя. Загляните позже или добавьте новые.")}
            </Text>
          )}
          <HStack>
            <Button
              onClick={() => {
                void navigate({ to: "/app/exams/$examId", params: { examId } });
              }}
            >
              {typo("К экзамену")}
            </Button>
          </HStack>
        </SimpleCard>
      ) : (
        <CardPlayer
          key={card.id}
          card={card}
          kind={kind}
          onDone={(correct) => {
            if (correct) setCorrectCount((count) => count + 1);
            setIndex((current) => current + 1);
          }}
        />
      )}
    </VStack>
  );
}
