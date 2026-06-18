import { Check, RotateCcw, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Button, HStack, Text, VStack } from "~/components";
import { type ReviewGrade, typo } from "~/lib";

interface SwipeCardProps {
  question: string;
  answer: string;
  onSwipe: (grade: ReviewGrade) => void;
}

// Сдвиг для засчитывания свайпа, порог тапа (переворот), порог определения оси и время вылета.
const SWIPE_THRESHOLD = 110;
const TAP_THRESHOLD = 8;
const INTENT_THRESHOLD = 8;
const EXIT_MS = 280;

// Скрываем обратную сторону грани при 3D-перевороте.
const hiddenBackface: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

export function SwipeCard({ question, answer, onSwipe }: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Направление вылета карточки: -1 влево («сложно»), +1 вправо («вспомнил»), 0 — на месте.
  const [exitDir, setExitDir] = useState(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  // Ось жеста: пока не определена — none; горизонталь — свайп, вертикаль — отдаём прокрутке контента.
  const axisRef = useRef<"none" | "x" | "y">("none");
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
    startYRef.current = event.clientY;
    axisRef.current = "none";
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging || submittedRef.current) return;
    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;
    if (axisRef.current === "none") {
      if (Math.abs(deltaX) < INTENT_THRESHOLD && Math.abs(deltaY) < INTENT_THRESHOLD) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        axisRef.current = "x";
        // Горизонтальный жест — захватываем указатель, чтобы свайп не «слетал» на полпути.
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        axisRef.current = "y";
      }
    }
    if (axisRef.current === "y") return; // вертикаль — пусть скроллится контент
    setDragX(deltaX);
  };

  const finishDrag = () => {
    if (!dragging || submittedRef.current) return;
    setDragging(false);
    const delta = dragX;
    const axis = axisRef.current;
    axisRef.current = "none";
    if (axis === "x" && delta > SWIPE_THRESHOLD) {
      commit("good");
      return;
    }
    if (axis === "x" && delta < -SWIPE_THRESHOLD) {
      commit("again");
      return;
    }
    if (axis === "none" && Math.abs(delta) < TAP_THRESHOLD) toggleFlip();
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
  const cardTransform = exiting
    ? `translateX(${exitDir * 100}vw) rotate(${exitDir * 18}deg)`
    : `translateX(${dragX}px) rotate(${dragX / 25}deg)`;
  const cardTransition = dragging ? "none" : "transform 0.28s ease, opacity 0.28s ease";
  const goodOpacity = dragX > 0 ? Math.min(dragX / SWIPE_THRESHOLD, 1) : 0;
  const againOpacity = dragX < 0 ? Math.min(-dragX / SWIPE_THRESHOLD, 1) : 0;

  return (
    <VStack gap="sm" className="min-h-0 w-full flex-1 select-none">
      <div className="min-h-0 w-full flex-1" style={{ perspective: "1200px" }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={typo("Карточка. Нажмите, чтобы перевернуть; стрелки влево и вправо — оценка")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          className="relative h-full cursor-grab touch-pan-y outline-none"
          style={{ transform: cardTransform, transition: cardTransition, opacity: exiting ? 0 : 1, transformStyle: "preserve-3d" }}
        >
          <div
            className="relative h-full"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: "transform 0.45s ease",
            }}
          >
            {/* Лицо: вопрос */}
            <div
              className="bg-card absolute inset-0 flex flex-col gap-4 rounded-3xl p-6 shadow-md"
              style={hiddenBackface}
            >
              <Text variant="mini" color="supplementary" align="center">
                {typo("Вопрос")}
              </Text>
              <div className="flex-1 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center">
                  <Text variant="large" align="center" breakWords>
                    {typo(question)}
                  </Text>
                </div>
              </div>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Нажмите, чтобы перевернуть")}
              </Text>
            </div>

            {/* Оборот: ответ */}
            <div
              className="bg-card absolute inset-0 flex flex-col gap-4 rounded-3xl p-6 shadow-md"
              style={{ ...hiddenBackface, transform: "rotateY(180deg)" }}
            >
              <Text variant="mini" color="supplementary" align="center">
                {typo("Ответ")}
              </Text>
              <div className="flex-1 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center">
                  <Text variant="large" align="center" breakWords>
                    {typo(answer)}
                  </Text>
                </div>
              </div>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Свайп вправо — вспомнил, влево — было сложно")}
              </Text>
            </div>
          </div>

          <span
            className="border-success text-success pointer-events-none absolute top-4 left-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
            style={{ opacity: goodOpacity, transform: "translateZ(60px)" }}
          >
            {typo("Вспомнил")}
          </span>
          <span
            className="border-destructive text-destructive pointer-events-none absolute top-4 right-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
            style={{ opacity: againOpacity, transform: "translateZ(60px)" }}
          >
            {typo("Сложно")}
          </span>
        </div>
      </div>

      <HStack gap="sm" justify="center" className="w-full shrink-0">
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
