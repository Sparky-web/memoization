import { BookOpen, Check, RotateCcw, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Button, HStack, MarkdownView, ResponsiveModal, Text, VStack } from "~/components";
import { type ReviewGrade, typo } from "~/lib";

interface SwipeCardProps {
  question: string;
  answer: string;
  /** Развёрнутый ответ (markdown) — показывается по кнопке «Изучить подробнее»; null — кнопки нет. */
  answerDeep: string | null;
  onSwipe: (grade: ReviewGrade) => void;
}

const SWIPE_THRESHOLD = 110;
const TAP_THRESHOLD = 8;
const INTENT_THRESHOLD = 8;
// Во сколько раз вертикаль должна превышать горизонталь, чтобы жест считался скроллом,
// а не свайпом (>1 — щедрый запас под диагональ: реальный палец редко идёт строго вбок).
const VERTICAL_BIAS = 1.5;
const EXIT_MS = 280;
const REST_TRANSITION = "transform 0.28s ease, opacity 0.28s ease";

const hiddenBackface: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

type Axis = "none" | "x" | "y";

export function SwipeCard({ question, answer, answerDeep, onSwipe }: SwipeCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [exitDir, setExitDir] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);

  // Перетаскивание ведём через ref + прямой DOM, а не setState на каждый pointermove:
  // так первый move не теряется из-за асинхронного коммита состояния и нет ре-рендера на кадр.
  const cardRef = useRef<HTMLDivElement>(null);
  const frontPaneRef = useRef<HTMLDivElement>(null);
  const backPaneRef = useRef<HTMLDivElement>(null);
  const goodBadgeRef = useRef<HTMLSpanElement>(null);
  const againBadgeRef = useRef<HTMLSpanElement>(null);

  const draggingRef = useRef(false);
  const dragXRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const axisRef = useRef<Axis>("none");
  const flippedRef = useRef(false);
  const submittedRef = useRef(false);

  // Прямая запись трансформа карточки и непрозрачности бейджей — без ре-рендера.
  const paintDrag = (deltaX: number) => {
    const card = cardRef.current;
    if (card) {
      card.style.transition = "none";
      card.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 25}deg)`;
    }
    const good = goodBadgeRef.current;
    if (good) good.style.opacity = `${deltaX > 0 ? Math.min(deltaX / SWIPE_THRESHOLD, 1) : 0}`;
    const again = againBadgeRef.current;
    if (again) again.style.opacity = `${deltaX < 0 ? Math.min(-deltaX / SWIPE_THRESHOLD, 1) : 0}`;
  };

  // Возврат карточки в центр с анимацией (не деструктивно: вызывается и на cancel).
  const animateBack = () => {
    dragXRef.current = 0;
    const card = cardRef.current;
    if (card) {
      card.style.transition = REST_TRANSITION;
      card.style.transform = "translateX(0px) rotate(0deg)";
    }
    if (goodBadgeRef.current) goodBadgeRef.current.style.opacity = "0";
    if (againBadgeRef.current) againBadgeRef.current.style.opacity = "0";
  };

  const toggleFlip = () => {
    setFlipped((value) => {
      flippedRef.current = !value;
      return !value;
    });
  };

  const commit = (grade: ReviewGrade) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    draggingRef.current = false;
    // Во время перетаскивания transition был снят (paintDrag) — возвращаем плавность,
    // иначе улёт карточки произошёл бы мгновенно. React зададим только сам трансформ улёта.
    const card = cardRef.current;
    if (card) card.style.transition = REST_TRANSITION;
    setExitDir(grade === "good" ? 1 : -1);
    setTimeout(() => {
      onSwipe(grade);
    }, EXIT_MS);
  };

  // iOS Safari ненадёжно соблюдает touch-action:none и перехватывает диагональный жест
  // под прокрутку всей страницы (свайп при этом срывается). Поэтому на нативном touchmove
  // (passive:false) глушим прокрутку, пока идёт жест по карточке. Колбэк-ref, не useEffect.
  const setCardRef = (node: HTMLDivElement | null) => {
    cardRef.current = node;
    if (!node) return () => undefined;
    const onTouchMove = (event: TouchEvent) => {
      if (draggingRef.current) event.preventDefault();
    };
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      node.removeEventListener("touchmove", onTouchMove);
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (submittedRef.current || detailOpen) return;
    // Флаг ставим синхронно в ref — следующий pointermove увидит его сразу.
    draggingRef.current = true;
    dragXRef.current = 0;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    lastYRef.current = event.clientY;
    axisRef.current = "none";
  };

  const activePane = (): HTMLDivElement | null => (flippedRef.current ? backPaneRef.current : frontPaneRef.current);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || submittedRef.current) return;
    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;

    if (axisRef.current === "none") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < INTENT_THRESHOLD && absY < INTENT_THRESHOLD) return;
      // Захватываем указатель: при x — тащим карточку, при y — сами прокручиваем контент.
      // Поверхность имеет touch-action:none, поэтому браузер уже не отнимет жест.
      event.currentTarget.setPointerCapture(event.pointerId);
      // Свайп — основной жест. Вертикалью (скроллом) считаем движение, только если контент
      // реально прокручивается И жест заметно круче горизонтали; иначе любая диагональ — свайп.
      const pane = activePane();
      let canScroll = false;
      if (pane) canScroll = pane.scrollHeight > pane.clientHeight;
      axisRef.current = canScroll && absY > absX * VERTICAL_BIAS ? "y" : "x";
    }

    if (axisRef.current === "y") {
      // Ручной проброс вертикальной прокрутки внутрь активной грани карточки.
      const pane = activePane();
      if (pane) pane.scrollTop -= event.clientY - lastYRef.current;
      lastYRef.current = event.clientY;
      return;
    }

    dragXRef.current = deltaX;
    paintDrag(deltaX);
  };

  const finishDrag = () => {
    if (!draggingRef.current || submittedRef.current) return;
    draggingRef.current = false;
    const delta = dragXRef.current;
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
    animateBack();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (submittedRef.current || detailOpen) return;
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
  // В покое трансформ карточки и бейджей задаёт DOM (paintDrag/animateBack); React управляет
  // только улётом за экран. Начальные значения берутся из inline-style при монтировании.
  const cardTransform = exiting
    ? `translateX(${exitDir * 100}vw) rotate(${exitDir * 18}deg)`
    : "translateX(0px) rotate(0deg)";

  return (
    <VStack gap="sm" className="min-h-0 w-full flex-1 select-none">
      <div className="min-h-0 w-full flex-1" style={{ perspective: "1200px" }}>
        <div
          ref={setCardRef}
          role="button"
          tabIndex={0}
          aria-label={typo("Карточка. Нажмите, чтобы перевернуть; стрелки влево и вправо — оценка")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          // touch-none: поверхность сама владеет жестом, браузер не запускает нативный pan
          // и не шлёт pointercancel посреди свайпа (вертикальный скролл пробрасываем вручную).
          className="relative h-full cursor-grab touch-none outline-none"
          style={{ transform: cardTransform, transition: REST_TRANSITION, opacity: exiting ? 0 : 1, transformStyle: "preserve-3d" }}
        >
          <div
            className="relative h-full"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: "transform 0.45s ease",
            }}
          >
            <div className="bg-card absolute inset-0 flex flex-col gap-4 rounded-3xl p-6 shadow-md" style={hiddenBackface}>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Вопрос")}
              </Text>
              <div ref={frontPaneRef} className="flex-1 overflow-y-auto">
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

            <div
              className="bg-card absolute inset-0 flex flex-col gap-4 rounded-3xl p-6 shadow-md"
              style={{ ...hiddenBackface, transform: "rotateY(180deg)" }}
            >
              <Text variant="mini" color="supplementary" align="center">
                {typo("Ответ")}
              </Text>
              <div ref={backPaneRef} className="flex-1 overflow-y-auto">
                <div className="flex min-h-full flex-col gap-4">
                  <MarkdownView>{answer}</MarkdownView>
                  {answerDeep && (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={() => {
                          setDetailOpen(true);
                        }}
                      >
                        <BookOpen className="size-4" />
                        {typo("Изучить подробнее")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Свайп вправо — вспомнил, влево — было сложно")}
              </Text>
            </div>
          </div>

          <span
            ref={goodBadgeRef}
            className="border-success text-success pointer-events-none absolute top-4 left-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
            style={{ opacity: 0, transform: "translateZ(60px)" }}
          >
            {typo("Вспомнил")}
          </span>
          <span
            ref={againBadgeRef}
            className="border-destructive text-destructive pointer-events-none absolute top-4 right-4 rounded-md border-2 px-2 py-1 text-sm font-bold"
            style={{ opacity: 0, transform: "translateZ(60px)" }}
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

      {answerDeep && (
        <ResponsiveModal open={detailOpen} onOpenChange={setDetailOpen} title={typo(question)}>
          <MarkdownView>{answerDeep}</MarkdownView>
        </ResponsiveModal>
      )}
    </VStack>
  );
}
