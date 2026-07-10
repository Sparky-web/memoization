import { useMutation } from "@tanstack/react-query";
import { Check, RotateCcw, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { AdaptiveGrid, Badge, Button, Heading, HStack, MarkdownView, Text, VStack } from "~/components";
import { typo } from "~/lib";
import { type SessionCard, submitSwipe } from "~/server/fn/session";

import { cardFormatLabel } from "../../../../_lib";

// Свайп-плеер: карточка-сцена с 3D-переворотом (тап/Space), после — свайп вправо «вспомнил» /
// влево «не вспомнил» с вылетом за экран. Самооценочный режим: ответ приходит с карточкой.
// Механика перенесена из старых «Мемокарт»: drag с поворотом, различение осей (вертикаль отдаёт
// прокрутку контенту), submittedRef-защита от двойной отправки, клавиатура ←/→/Space,
// кнопки-дублёры всегда видны (и это единственный путь при reduced-motion).

/** Итог свайпа — форма совпадает с CardOutcome плеера сессии. */
export interface SwipeOutcome {
  cardId: string;
  correct: boolean;
  confidence: number | null;
}

interface SwipeCardPlayerProps {
  card: SessionCard;
  onFinished: (outcome: SwipeOutcome) => void;
}

const SWIPE_THRESHOLD = 110;
const TAP_THRESHOLD = 8;
const INTENT_THRESHOLD = 8;
// Во сколько раз вертикаль должна превышать горизонталь, чтобы жест считался прокруткой,
// а не свайпом (>1 — щедрый запас под диагональ: реальный палец редко идёт строго вбок).
const VERTICAL_BIAS = 1.5;
const EXIT_MS = 280;
const REST_TRANSITION = "transform 0.28s var(--ease-out), opacity 0.28s var(--ease-out)";

const hiddenBackface: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

type Axis = "none" | "x" | "y";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Текст ответа закрытых форматов: truefalse хранит "true"/"false", человеку — слова.
function answerLabelOf(card: SessionCard): string {
  if (card.format === "truefalse") return card.answer === "true" ? typo("Верно") : typo("Неверно");
  return typo(card.answer ?? "");
}

export function SwipeCardPlayer({ card, onFinished }: SwipeCardPlayerProps) {
  const [flipped, setFlipped] = useState(false);
  const [exitDir, setExitDir] = useState(0);
  const [goodPulse, setGoodPulse] = useState(false);
  const [startedAt] = useState(() => Date.now());

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
  const lastDirectionRef = useRef(true);
  // Очередь двигается, когда сервер подтвердил ответ И вылет доигран (что наступит позже).
  const pendingRef = useRef<{ exited: boolean; outcome: SwipeOutcome | null }>({ exited: false, outcome: null });

  // Прямая запись трансформа карточки и непрозрачности бейджей — без ре-рендера.
  const paintDrag = (deltaX: number) => {
    const cardNode = cardRef.current;
    if (cardNode) {
      cardNode.style.transition = "none";
      cardNode.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 25}deg)`;
    }
    const good = goodBadgeRef.current;
    if (good) good.style.opacity = `${deltaX > 0 ? Math.min(deltaX / SWIPE_THRESHOLD, 1) : 0}`;
    const again = againBadgeRef.current;
    if (again) again.style.opacity = `${deltaX < 0 ? Math.min(-deltaX / SWIPE_THRESHOLD, 1) : 0}`;
  };

  // Возврат карточки в центр с анимацией (не деструктивно: вызывается и на cancel, и при ошибке сети).
  const animateBack = () => {
    dragXRef.current = 0;
    const cardNode = cardRef.current;
    if (cardNode) {
      cardNode.style.transition = REST_TRANSITION;
      cardNode.style.transform = "translateX(0px) rotate(0deg)";
    }
    if (goodBadgeRef.current) goodBadgeRef.current.style.opacity = "0";
    if (againBadgeRef.current) againBadgeRef.current.style.opacity = "0";
  };

  const toggleFlip = () => {
    if (submittedRef.current) return;
    setFlipped((value) => {
      flippedRef.current = !value;
      return !value;
    });
  };

  const tryFinish = () => {
    const pending = pendingRef.current;
    if (pending.exited && pending.outcome) onFinished(pending.outcome);
  };

  const submit = useMutation({
    mutationFn: (remembered: boolean) =>
      submitSwipe({
        data: { cardId: card.id, remembered, durationMs: Math.min(Date.now() - startedAt, 3_600_000) },
      }),
    onSuccess: (graded) => {
      pendingRef.current.outcome = { cardId: card.id, correct: graded.correct, confidence: null };
      tryFinish();
    },
    onError: () => {
      // Очередь не двигается, пока сервер не подтвердил ответ: возвращаем карточку в центр.
      submittedRef.current = false;
      setExitDir(0);
      setGoodPulse(false);
      animateBack();
    },
  });

  const commit = (remembered: boolean) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    draggingRef.current = false;
    lastDirectionRef.current = remembered;
    // Во время перетаскивания transition был снят (paintDrag) — возвращаем плавность,
    // иначе улёт карточки произошёл бы мгновенно. React задаёт только сам трансформ улёта.
    const cardNode = cardRef.current;
    if (cardNode) cardNode.style.transition = REST_TRANSITION;
    if (remembered) setGoodPulse(true);
    setExitDir(remembered ? 1 : -1);
    pendingRef.current = { exited: false, outcome: null };
    submit.mutate(remembered);
    window.setTimeout(
      () => {
        pendingRef.current.exited = true;
        tryFinish();
      },
      reducedMotion() ? 0 : EXIT_MS,
    );
  };

  // iOS Safari ненадёжно соблюдает touch-action:none и перехватывает диагональный жест
  // под прокрутку всей страницы (свайп при этом срывается). Поэтому на нативном touchmove
  // (passive:false) глушим прокрутку, пока идёт жест по карточке. Колбэк-ref с cleanup.
  // Здесь же фокус на карточку: клавиши ←/→/Space должны работать сразу, без клика по сцене.
  const setCardRef = (node: HTMLDivElement | null) => {
    cardRef.current = node;
    if (!node) return () => undefined;
    node.focus({ preventScroll: true });
    const onTouchMove = (event: TouchEvent) => {
      if (draggingRef.current) event.preventDefault();
    };
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      node.removeEventListener("touchmove", onTouchMove);
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (submittedRef.current) return;
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
      // Свайп — основной жест. Вертикалью (прокруткой) считаем движение, только если контент
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
      commit(true);
      return;
    }
    if (axis === "x" && delta < -SWIPE_THRESHOLD) {
      commit(false);
      return;
    }
    if (axis === "none" && Math.abs(delta) < TAP_THRESHOLD) toggleFlip();
    animateBack();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (submittedRef.current) return;
    if (event.key === "ArrowRight") {
      commit(true);
      return;
    }
    if (event.key === "ArrowLeft") {
      commit(false);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleFlip();
    }
  };

  const exiting = exitDir !== 0;
  // В покое трансформ карточки и бейджей задаёт DOM (paintDrag/animateBack); React управляет
  // только улётом за экран. При reduced-motion вылет не анимируется — карточка просто гаснет.
  const cardTransform = exiting
    ? `translateX(${exitDir * 100}vw) rotate(${exitDir * 18}deg)`
    : "translateX(0px) rotate(0deg)";
  const flipTransition = reducedMotion() ? "none" : "transform 0.45s var(--ease-in-out)";
  const busy = exiting || submit.isPending;

  const facePlacementClass = "absolute inset-0 flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card";

  return (
    <VStack gap="sm" className="w-full select-none">
      {goodPulse && <div aria-hidden className="good-pulse pointer-events-none fixed inset-0 z-10 bg-success/15" />}

      <div className="relative h-96 w-full sm:h-120" style={{ perspective: "1200px" }}>
        <div
          ref={setCardRef}
          role="button"
          tabIndex={0}
          aria-label={typo("Карточка. Нажмите, чтобы перевернуть; стрелки вправо и влево — «вспомнил» и «не вспомнил»")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          // touch-none: поверхность сама владеет жестом, браузер не запускает нативный pan
          // и не шлёт pointercancel посреди свайпа (вертикальную прокрутку пробрасываем вручную).
          // Кольца фокуса нет сознательно: карточка получает автофокус на каждом показе,
          // и постоянная рамка вокруг всей сцены читалась бы как выделение.
          className="relative h-full cursor-grab touch-none outline-none"
          style={{
            transform: cardTransform,
            transition: REST_TRANSITION,
            opacity: exiting ? 0 : 1,
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="relative h-full"
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: flipTransition,
            }}
          >
            {/* Лицо: формат + тема и вопрос. Прокрутка длинного текста — внутри грани. */}
            <div className={facePlacementClass} style={hiddenBackface}>
              <HStack gap="sm" align="center" justify="center" wrap>
                <Badge variant="dot" dot="primary">
                  {cardFormatLabel(card.format)}
                </Badge>
                {card.topic && (
                  <Badge variant="dot" dot="muted">
                    {typo(card.topic)}
                  </Badge>
                )}
              </HStack>
              <div ref={frontPaneRef} className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center">
                  {card.format === "cloze" ? (
                    <Heading variant="h3" asParagraph align="center" breakWords>
                      {typo(card.prompt)}
                    </Heading>
                  ) : (
                    <MarkdownView variant="prompt">{card.prompt}</MarkdownView>
                  )}
                </div>
              </div>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Сначала вспомни ответ, потом переверни — нажатием или пробелом")}
              </Text>
            </div>

            {/* Оборот: ответ + «почему». */}
            <div className={facePlacementClass} style={{ ...hiddenBackface, transform: "rotateY(180deg)" }}>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Ответ")}
              </Text>
              <div ref={backPaneRef} className="min-h-0 flex-1 overflow-y-auto">
                <VStack gap="sm" justify="center" className="min-h-full py-1 text-center">
                  <div className="flex flex-1 items-center justify-center">
                    {card.format === "open" ? (
                      <MarkdownView>{card.answer ?? ""}</MarkdownView>
                    ) : (
                      <Heading variant="h3" asParagraph align="center" breakWords>
                        {answerLabelOf(card)}
                      </Heading>
                    )}
                  </div>
                  {card.explanation && (
                    <Text variant="small" color="supplementary" align="center" breakWords>
                      {typo(card.explanation)}
                    </Text>
                  )}
                </VStack>
              </div>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Свайп вправо — вспомнил, влево — не вспомнил")}
              </Text>
            </div>
          </div>

          {/* Бейджи-вердикты при перетаскивании: непрозрачность растёт к порогу свайпа. */}
          <span
            ref={goodBadgeRef}
            className="pointer-events-none absolute top-4 left-4 rounded-full border-2 border-success bg-success/10 px-3 py-1 text-success"
            style={{ opacity: 0, transform: "translateZ(60px)" }}
          >
            <Text variant="small" bold>
              {typo("Вспомнил")}
            </Text>
          </span>
          <span
            ref={againBadgeRef}
            className="pointer-events-none absolute top-4 right-4 rounded-full border-2 border-destructive bg-destructive/10 px-3 py-1 text-destructive"
            style={{ opacity: 0, transform: "translateZ(60px)" }}
          >
            <Text variant="small" bold>
              {typo("Не вспомнил")}
            </Text>
          </span>
        </div>
      </div>

      {submit.isError && (
        <VStack gap="2xs" className="rounded-2xl border border-destructive/25 bg-card p-3">
          <Text variant="small" color="destructive">
            {typo("Не получилось отправить ответ — проверь сеть.")}
          </Text>
          <HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                commit(lastDirectionRef.current);
              }}
            >
              {typo("Повторить")}
            </Button>
          </HStack>
        </VStack>
      )}

      {/* Кнопки-дублёры свайпов: всегда видны — работают и без жестов (reduced-motion, десктоп).
          Вердикты — парой на всю ширину (в один ряд с «Перевернуть» они переносились на 390),
          переворот — тихой кнопкой ниже. */}
      <VStack gap="2xs" className="w-full">
        <AdaptiveGrid cols={{ base: 2 }} gap="sm">
          <Button
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => {
              commit(false);
            }}
          >
            <X className="size-4" strokeWidth={1.8} />
            {typo("Не вспомнил")}
          </Button>
          <Button
            size="lg"
            disabled={busy}
            onClick={() => {
              commit(true);
            }}
          >
            <Check className="size-4" strokeWidth={1.8} />
            {typo("Вспомнил")}
          </Button>
        </AdaptiveGrid>
        <HStack justify="center">
          <Button variant="ghost" disabled={busy} onClick={toggleFlip}>
            <RotateCcw className="size-4" strokeWidth={1.8} />
            {typo("Перевернуть")}
          </Button>
        </HStack>
      </VStack>
    </VStack>
  );
}
