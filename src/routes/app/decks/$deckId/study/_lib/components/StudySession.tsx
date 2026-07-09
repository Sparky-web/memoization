import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button, ConfirmDialog, Heading, HStack, Stat, Text, useMountEffect, VStack } from "~/components";
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
  /** Владелец колоды — для него в окне «подробнее» доступен чат по карточке. */
  isOwner: boolean;
  initialCards: StudyCardView[];
  onReview: (cardId: string, grade: ReviewGrade) => Promise<unknown>;
  onRestart: () => void;
  restartPending: boolean;
}

const REQUEUE_AGAIN_GAP = 2;
const REQUEUE_GOOD_GAP = 6;
// Окно «Отменить»: ответ уходит на сервер после паузы, чтобы случайный свайп можно было вернуть.
const UNDO_DELAY_MS = 3500;

// Снимок состояния сессии до свайпа — для отмены и для отката при ошибке сети.
interface SessionSnapshot {
  queue: StudyCardView[];
  progress: Record<string, number>;
  reviewed: number;
  learned: number;
}

interface PendingReview {
  /** Снимок для «Отменить» — вернуть карточку на прежнее место. */
  snapshot: SessionSnapshot;
  timer: ReturnType<typeof setTimeout>;
  /** Отправка ответа на сервер (замыкание свайпа — с откатом при ошибке сети). */
  send: () => void;
}

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
  isOwner,
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
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);

  // Отложенная отправка последнего ответа: пока идёт окно отмены, мутация не уходит.
  const pendingRef = useRef<PendingReview | null>(null);
  const swipeSeqRef = useRef(0);
  const [pendingGrade, setPendingGrade] = useState<ReviewGrade | null>(null);

  const restoreSnapshot = (snapshot: SessionSnapshot) => {
    setQueue(snapshot.queue);
    setProgress(snapshot.progress);
    setReviewed(snapshot.reviewed);
    setLearned(snapshot.learned);
  };

  // Немедленно отправляет отложенный ответ (следующий свайп, истечение таймера, уход со страницы).
  // Замыкается только на стабильные значения (ref и сеттер) — безопасно звать из cleanup при размонтировании.
  const flushPending = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setPendingGrade(null);
    pending.send();
  };

  // «Отменить»: возвращаем карточку на прежнее место, мутация не уходит.
  const undoPending = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setPendingGrade(null);
    restoreSnapshot(pending.snapshot);
  };

  // Уход со страницы любым путём (в том числе навигация из шапки): отложенный ответ не должен потеряться.
  useMountEffect(() => () => {
    flushPending();
  });

  const goToDeck = () => {
    flushPending();
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  const confirmRestart = () => {
    setRestartConfirmOpen(false);
    flushPending();
    onRestart();
  };

  const restartConfirmDialog = (
    <ConfirmDialog
      open={restartConfirmOpen}
      onOpenChange={setRestartConfirmOpen}
      title={typo("Начать заново?")}
      description={typo(
        "Прогресс повторений по всем карточкам колоды будет сброшен — они снова станут новыми. Статистика повторений сохранится.",
      )}
      confirmLabel={typo("Сбросить прогресс")}
      confirmPending={restartPending}
      onConfirm={confirmRestart}
    />
  );

  const pendingToast = pendingGrade && (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <HStack gap="md" align="center" className="rounded-full border border-border bg-card px-5 py-2 shadow-lg">
        <Text variant="small">{pendingGrade === "good" ? typo("Вспомнил ✓") : typo("Было сложно")}</Text>
        <Button variant="link" size="inline" onClick={undoPending}>
          {typo("Отменить")}
        </Button>
      </HStack>
    </div>
  );

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
          <Button
            disabled={restartPending}
            onClick={() => {
              setRestartConfirmOpen(true);
            }}
          >
            {typo("Начать заново")}
          </Button>
          <Button variant="outline" onClick={goToDeck}>
            {typo("К колоде")}
          </Button>
        </HStack>
        {restartConfirmDialog}
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
          <Button
            disabled={restartPending}
            onClick={() => {
              setRestartConfirmOpen(true);
            }}
          >
            {typo("Начать заново")}
          </Button>
          <Button variant="outline" onClick={goToDeck}>
            {typo("К колоде")}
          </Button>
        </HStack>
        {restartConfirmDialog}
        {pendingToast}
      </VStack>
    );
  }

  const handleSwipe = (grade: ReviewGrade) => {
    // Предыдущий отложенный ответ уходит немедленно — окно отмены действует только для последнего.
    flushPending();

    const card = current;
    const snapshot: SessionSnapshot = { queue, progress, reviewed, learned };

    const goodCount = grade === "good" ? (progress[card.id] ?? 0) + 1 : 0;
    const graduated = grade === "good" && goodCount >= requiredCorrect;

    setReviewed((value) => value + 1);
    if (grade === "good") setGoodPulse((value) => value + 1);
    setProgress((map) => ({ ...map, [card.id]: goodCount }));
    if (graduated) setLearned((value) => value + 1);
    setQueue(graduated ? queue.slice(1) : requeue(queue, grade === "good" ? REQUEUE_GOOD_GAP : REQUEUE_AGAIN_GAP));

    swipeSeqRef.current += 1;
    const swipeSeq = swipeSeqRef.current;
    const send = () => {
      void onReview(card.id, grade).catch(() => {
        // Откатываем, только если это всё ещё последний свайп — иначе затёрли бы более новое состояние.
        if (swipeSeqRef.current === swipeSeq) restoreSnapshot(snapshot);
      });
    };
    const timer = setTimeout(() => {
      flushPending();
    }, UNDO_DELAY_MS);
    pendingRef.current = { snapshot, timer, send };
    setPendingGrade(grade);
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
        cardId={current.id}
        question={current.question}
        answer={current.answer}
        answerDeep={current.answerDeep}
        isOwner={isOwner}
        onSwipe={handleSwipe}
      />

      {requiredCorrect > 1 && (
        <Text variant="small" color="supplementary" align="center">
          {typo(`Вправо для запоминания: ${currentProgress} из ${requiredCorrect}`)}
        </Text>
      )}

      {restartConfirmDialog}
      {pendingToast}
    </div>
  );
}
