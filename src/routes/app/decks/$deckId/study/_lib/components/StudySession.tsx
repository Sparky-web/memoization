import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button, Heading, HStack, Stat, Text, VStack } from "~/components";
import { type ReviewGrade, typo } from "~/lib";

import { SwipeCard } from "./SwipeCard";

interface StudyCardView {
  id: string;
  question: string;
  answer: string;
}

interface StudySessionProps {
  deckId: string;
  deckTitle: string;
  /** Сколько раз свайпнуть вправо, чтобы карточка считалась выученной в этой сессии. */
  requiredCorrect: number;
  initialCards: StudyCardView[];
  onReview: (cardId: string, grade: ReviewGrade) => Promise<unknown>;
}

// Куда вернуть карточку: «сложно» — близко (повторить скорее), «вспомнил, но ещё не выучена» — дальше.
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

export function StudySession({ deckId, deckTitle, requiredCorrect, initialCards, onReview }: StudySessionProps) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(initialCards);
  // Сколько раз карточку уже свайпнули вправо в этой сессии.
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [reviewed, setReviewed] = useState(0);
  const [learned, setLearned] = useState(0);
  // Счётчик «вспомнил» — каждое увеличение перезапускает зелёную пульсацию.
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
          {typo("Возвращайтесь позже — карточки появятся, когда подойдёт срок повторения.")}
        </Text>
        <Button onClick={goToDeck}>{typo("К колоде")}</Button>
      </VStack>
    );
  }

  const current = queue[0];

  if (!current) {
    return (
      <VStack gap="lg" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4">
        <Heading variant="h2" align="center">
          {typo("Сессия завершена")}
        </Heading>
        <HStack gap="md" wrap justify="center">
          <Stat label={typo("Повторено")} value={reviewed} />
          <Stat label={typo("Выучено")} value={`${learned} / ${initialCards.length}`} />
        </HStack>
        <Button onClick={goToDeck}>{typo("К колоде")}</Button>
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

    // Оптимистично продвигаем сессию...
    setReviewed((value) => value + 1);
    if (grade === "good") setGoodPulse((value) => value + 1);
    setProgress((map) => ({ ...map, [card.id]: goodCount }));
    if (graduated) setLearned((value) => value + 1);
    setQueue(
      graduated ? previousQueue.slice(1) : requeue(previousQueue, grade === "good" ? REQUEUE_GOOD_GAP : REQUEUE_AGAIN_GAP),
    );

    // ...и откатываем всё, если ответ не удалось сохранить на сервере (тост покажет мутация).
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
        <Text variant="small" color="supplementary" maxLines={1}>
          {typo(deckTitle)}
        </Text>
        <HStack gap="sm" align="center">
          <Text variant="small" color="supplementary">
            {typo(`Осталось: ${queue.length}`)}
          </Text>
          <Button variant="link" size="inline" onClick={goToDeck}>
            {typo("Завершить")}
          </Button>
        </HStack>
      </HStack>

      <SwipeCard key={current.id} question={current.question} answer={current.answer} onSwipe={handleSwipe} />

      {requiredCorrect > 1 && (
        <Text variant="small" color="supplementary" align="center">
          {typo(`Вправо для запоминания: ${currentProgress} из ${requiredCorrect}`)}
        </Text>
      )}
    </div>
  );
}
