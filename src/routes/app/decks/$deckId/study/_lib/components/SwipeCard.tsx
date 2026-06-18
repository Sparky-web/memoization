import { Check, RotateCcw, X } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Button, HStack, Text, VStack } from "~/components";
import { type ReviewGrade, typo } from "~/lib";

interface SwipeCardProps {
  question: string;
  answer: string;
  onSwipe: (grade: ReviewGrade) => void;
}

// Сдвиг для засчитывания свайпа, порог тапа (переворот) и длительность анимации вылета.
const SWIPE_THRESHOLD = 110;
const TAP_THRESHOLD = 8;
const EXIT_MS = 280;

export function SwipeCard({ question, answer, onSwipe }: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Направление вылета карточки: -1 влево («сложно»), +1 вправо («вспомнил»), 0 — на месте.
  const [exitDir, setExitDir] = useState(0);
  const startXRef = useRef(0);
  const submittedRef = useRef(false);

  const toggleFlip = () => {
    setFlipped((value) => !value);
  };

  // Запускаем анимацию вылета, а сам ответ отправляем, когда карточка «улетела».
  const commit = (grade: ReviewGrade) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setDragging(false);
    setExitDir(grade === "good" ? 1 : -1);
    setTimeout(() => {
      onSwipe(grade);
    }, EXIT_MS);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (submittedRef.current) return;
    setDragging(true);
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging || submittedRef.current) return;
    setDragX(event.clientX - startXRef.current);
  };

  const finishDrag = () => {
    if (!dragging || submittedRef.current) return;
    setDragging(false);
    const delta = dragX;
    if (delta > SWIPE_THRESHOLD) {
      commit("good");
      return;
    }
    if (delta < -SWIPE_THRESHOLD) {
      commit("again");
      return;
    }
    if (Math.abs(delta) < TAP_THRESHOLD) toggleFlip();
    setDragX(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (submittedRef.current) return;
    if (event.key === "ArrowRight") {
      commit("good");
      return;
    }
    if (event.key === "ArrowLeft") {
      commit("again");
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleFlip();
    }
  };

  const exiting = exitDir !== 0;
  const transform = exiting
    ? `translateX(${exitDir * 100}vw) rotate(${exitDir * 18}deg)`
    : `translateX(${dragX}px) rotate(${dragX / 25}deg)`;
  const transition = dragging ? "none" : "transform 0.28s ease, opacity 0.28s ease";
  const goodOpacity = dragX > 0 ? Math.min(dragX / SWIPE_THRESHOLD, 1) : 0;
  const againOpacity = dragX < 0 ? Math.min(-dragX / SWIPE_THRESHOLD, 1) : 0;

  return (
    <VStack gap="md" className="w-full max-w-md select-none">
      <div className="w-full" style={{ perspective: "1000px" }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={typo("Карточка. Нажмите, чтобы перевернуть; стрелки влево и вправо — оценка")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          className="cursor-grab touch-none outline-none"
          style={{ transform, transition, opacity: exiting ? 0 : 1 }}
        >
          <VStack gap="md" justify="center" className="bg-card relative min-h-72 rounded-3xl p-6 shadow-md">
            <Text variant="mini" color="supplementary" align="center">
              {flipped ? typo("Ответ") : typo("Вопрос")}
            </Text>
            <div className="flex flex-1 items-center justify-center">
              <Text variant="large" align="center">
                {typo(flipped ? answer : question)}
              </Text>
            </div>
            <Text variant="mini" color="supplementary" align="center">
              {flipped ? typo("Свайп вправо — вспомнил, влево — было сложно") : typo("Нажмите, чтобы перевернуть")}
            </Text>

            <span
              className="border-primary text-primary pointer-events-none absolute top-4 left-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
              style={{ opacity: goodOpacity }}
            >
              {typo("Вспомнил")}
            </span>
            <span
              className="border-destructive text-destructive pointer-events-none absolute top-4 right-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
              style={{ opacity: againOpacity }}
            >
              {typo("Сложно")}
            </span>
          </VStack>
        </div>
      </div>

      <HStack gap="sm" justify="center" className="w-full">
        <Button
          variant="outline"
          onClick={() => {
            commit("again");
          }}
        >
          <X className="size-4" />
          {typo("Сложно")}
        </Button>
        <Button variant="ghost" onClick={toggleFlip}>
          <RotateCcw className="size-4" />
          {typo("Перевернуть")}
        </Button>
        <Button
          onClick={() => {
            commit("good");
          }}
        >
          <Check className="size-4" />
          {typo("Вспомнил")}
        </Button>
      </HStack>
    </VStack>
  );
}
