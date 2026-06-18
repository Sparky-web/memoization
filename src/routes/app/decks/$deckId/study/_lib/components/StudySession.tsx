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
  initialCards: StudyCardView[];
  onReview: (cardId: string, grade: ReviewGrade) => Promise<unknown>;
}

// На сколько позиций назад возвращается карточка, отвеченная «сложно» — чтобы повторить её в этой же сессии.
const REQUEUE_GAP = 3;

// «Вспомнил» — карточка покидает сессию; «сложно» — возвращается на REQUEUE_GAP позиций назад.
function advanceQueue(queue: StudyCardView[], grade: ReviewGrade): StudyCardView[] {
  const [head, ...rest] = queue;
  if (!head) return queue;
  if (grade === "good") return rest;
  const insertAt = Math.min(REQUEUE_GAP, rest.length);
  const next = [...rest];
  next.splice(insertAt, 0, head);
  return next;
}

export function StudySession({ deckId, deckTitle, initialCards, onReview }: StudySessionProps) {
  const navigate = useNavigate();
  const [queue, setQueue] = useState(initialCards);
  const [reviewed, setReviewed] = useState(0);
  const [good, setGood] = useState(0);

  const goToDeck = () => {
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  if (!initialCards.length) {
    return (
      <VStack gap="md" justify="center" className="items-center py-16">
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
    const accuracy = reviewed > 0 ? Math.round((good / reviewed) * 100) : 0;
    return (
      <VStack gap="lg" justify="center" className="items-center py-16">
        <Heading variant="h2" align="center">
          {typo("Сессия завершена")}
        </Heading>
        <HStack gap="md" wrap justify="center">
          <Stat label={typo("Повторено")} value={reviewed} />
          <Stat label={typo("Вспомнили")} value={good} />
          <Stat label={typo("Точность")} value={`${accuracy}%`} />
        </HStack>
        <Button onClick={goToDeck}>{typo("К колоде")}</Button>
      </VStack>
    );
  }

  const handleSwipe = (grade: ReviewGrade) => {
    const card = current;
    const previousQueue = queue;
    // Оптимистично продвигаем сессию...
    setReviewed((value) => value + 1);
    if (grade === "good") setGood((value) => value + 1);
    setQueue(advanceQueue(previousQueue, grade));
    // ...и откатываем всё, если ответ не удалось сохранить на сервере (тост покажет мутация).
    void onReview(card.id, grade).catch(() => {
      setQueue(previousQueue);
      setReviewed((value) => Math.max(value - 1, 0));
      if (grade === "good") setGood((value) => Math.max(value - 1, 0));
    });
  };

  return (
    <VStack gap="lg" className="items-center">
      <HStack justify="between" align="center" gap="md" className="w-full max-w-md">
        <Text variant="small" color="supplementary">
          {typo(deckTitle)}
        </Text>
        <Text variant="small" color="supplementary">
          {typo(`Осталось: ${queue.length}`)}
        </Text>
      </HStack>
      <SwipeCard key={current.id} question={current.question} answer={current.answer} onSwipe={handleSwipe} />
      <Button variant="link" onClick={goToDeck}>
        {typo("Завершить")}
      </Button>
    </VStack>
  );
}
