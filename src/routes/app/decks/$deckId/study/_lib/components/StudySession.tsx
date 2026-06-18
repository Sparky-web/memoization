import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button, Heading, HStack, Stat, Text, VStack } from "~/components";
import { type ReviewGrade, typo } from "~/lib";

import { SwipeCard } from "./SwipeCard";

interface StudyCardView {
  id: string;
  question: string;
  answer: string;
  answerDeep: string | null;
}

interface StudySessionProps {
  deckId: string;
  deckTitle: string;
  /** Сколько раз свайпнуть вправо, чтобы карточка считалась выученной в этой сессии. */
  requiredCorrect: number;
  initialCards: StudyCardView[];
  onReview: (cardId: string, grade: ReviewGrade) => Promise<unknown>;
  onRestart: () => void;
  restartPending: boolean;
}

const REQUEUE_AGAIN_GAP = 2;
const REQUEUE_GOOD_GAP = 6;

function requeue(queue: StudyCardView[], gap: number): StudyCardView[] {
  const [head, ...rest] = queue;
  if (!head) return queue;
  const insertAt = Math.min(gap, rest.length);
  const next = [...rest];
  next.splice(insertAt, 0, head);
  return next;
}

export function StudySession({
  deckId,
  deckTitle,
  requiredCorrect,
  initialCards,
  onReview,
  onRestart,
  restartPending,
}: StudySessionProps) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(initialCards);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [reviewed, setReviewed] = useState(0);
  const [learned, setLearned] = useState(0);
  const [goodPulse, setGoodPulse] = useState(0);

  const goToDeck = () => {
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  if (!initialCards.length) {
    return (
      <VStack gap="md" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4 text-center">
        <Heading variant="h2" align="center">
          {typo("На сегодня всё повторено")}
        </Heading>
        <Text color="supplementary" align="center">
          {typo("Карточки появятся, когда подойдёт срок повторения. Можно пройти колоду заново.")}
        </Text>
        <HStack gap="sm" wrap justify="center">
          <Button onClick={onRestart} disabled={restartPending}>
            {typo("Начать заново")}
          </Button>
          <Button variant="outline" onClick={goToDeck}>
            {typo("К колоде")}
          </Button>
        </HStack>
      </VStack>
    );
  }

  const current = queue[0];

  if (!current) {
    const accuracy = reviewed > 0 ? Math.round((learned / initialCards.length) * 100) : 0;
    return (
      <VStack gap="lg" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4">
        <Heading variant="h2" align="center">
          {typo("Сессия завершена")}
        </Heading>
        <HStack gap="md" wrap justify="center">
          <Stat label={typo("Повторено")} value={reviewed} />
          <Stat label={typo("Выучено")} value={`${learned} / ${initialCards.length}`} />
          <Stat label={typo("Готово")} value={`${accuracy}%`} />
        </HStack>
        <HStack gap="sm" wrap justify="center">
          <Button onClick={onRestart} disabled={restartPending}>
            {typo("Начать заново")}
          </Button>
          <Button variant="outline" onClick={goToDeck}>
            {typo("К колоде")}
          </Button>
        </HStack>
      </VStack>
    );
  }

  const handleSwipe = (grade: ReviewGrade) => {
    const card = current;
    const previousQueue = queue;
    const previousProgress = progress;
    const previousReviewed = reviewed;
    const previousLearned = learned;

    const goodCount = grade === "good" ? (progress[card.id] ?? 0) + 1 : 0;
    const graduated = grade === "good" && goodCount >= requiredCorrect;

    setReviewed((value) => value + 1);
    if (grade === "good") setGoodPulse((value) => value + 1);
    setProgress((map) => ({ ...map, [card.id]: goodCount }));
    if (graduated) setLearned((value) => value + 1);
    setQueue(
      graduated ? previousQueue.slice(1) : requeue(previousQueue, grade === "good" ? REQUEUE_GOOD_GAP : REQUEUE_AGAIN_GAP),
    );

    void onReview(card.id, grade).catch(() => {
      setQueue(previousQueue);
      setProgress(previousProgress);
      setReviewed(previousReviewed);
      setLearned(previousLearned);
    });
  };

  const currentProgress = progress[current.id] ?? 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-3 px-4 py-3">
      {goodPulse > 0 && (
        <div
          key={goodPulse}
          aria-hidden
          className="good-pulse pointer-events-none fixed inset-0 z-50"
          style={{ background: "radial-gradient(circle at 50% 45%, var(--success), transparent 60%)" }}
        />
      )}

      <HStack justify="between" align="center" gap="sm" className="shrink-0">
        <div className="min-w-0 flex-1">
          <Text variant="small" color="supplementary" maxLines={1}>
            {typo(deckTitle)}
          </Text>
        </div>
        <HStack gap="sm" align="center" className="shrink-0 whitespace-nowrap">
          <Text variant="small" color="supplementary">
            {typo(`Осталось: ${queue.length}`)}
          </Text>
          <Button variant="link" size="inline" onClick={goToDeck}>
            {typo("Завершить")}
          </Button>
        </HStack>
      </HStack>

      <SwipeCard
        key={current.id}
        question={current.question}
        answer={current.answer}
        answerDeep={current.answerDeep}
        onSwipe={handleSwipe}
      />

      {requiredCorrect > 1 && (
        <Text variant="small" color="supplementary" align="center">
          {typo(`Вправо для запоминания: ${currentProgress} из ${requiredCorrect}`)}
        </Text>
      )}
    </div>
  );
}
