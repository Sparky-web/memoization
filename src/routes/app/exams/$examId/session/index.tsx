import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Coffee, Footprints, Moon, MoveRight, X } from "lucide-react";
import { type PropsWithChildren, useState } from "react";
import { toast } from "sonner";

import {
  AdaptiveGrid,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Heading,
  HStack,
  Input,
  MarkdownView,
  PaywallCard,
  ReadinessRing,
  SegmentedProgress,
  SimpleCard,
  Text,
  Textarea,
  useMountEffect,
  VStack,
} from "~/components";
import { EXPLAIN_WHY_MIN_REPS, isPaywallError, mskDayKey, typo, zodRussian } from "~/lib";
import { explainWhy } from "~/server/fn/chat";
import { answerCard, type AnswerResult, type SessionCard, submitOpenRating } from "~/server/fn/session";

import {
  cardFormatLabel,
  cardsCountLabel,
  createForecast,
  examQueries,
  isSleepTimeMsk,
  isWalkNudgeDay,
  markFocusBreakShown,
  PalaceBlock,
  pluralRu,
  recordFocusActivity,
  resolveForecast,
  SESSION_KIND_TITLES,
  type SessionKind,
  shouldSuggestFocusBreak,
} from "../../_lib";

// Плеер сессии припоминания — ядро продукта. Принципы: «одно дело на экране»,
// припоминание до показа ответа, немедленная обратная связь, нормализация ошибок претеста,
// спокойная стилистика перед сном и защита сна в зубрёжке.
// Раскладка: карточка-«сцена» по центру, панель действий снизу, переходы карточек slide+fade.

const searchSchema = zodRussian.object({
  kind: zodRussian.enum(["daily", "pretest", "bedtime", "cram"]).catch("daily"),
});

export const Route = createFileRoute("/app/exams/$examId/session/")({
  validateSearch: (search) => searchSchema.parse(search),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(examQueries.detail(params.examId)),
  head: () => ({ meta: [{ title: typo("Сессия") }] }),
  component: SessionPage,
});

interface CardOutcome {
  cardId: string;
  correct: boolean;
  confidence: number | null;
}

// Зубрёжка: неверно отвеченная карточка возвращается в очередь через несколько позиций
// («повторный показ ошибок в той же сессии через 5–10 карточек», дизайн-док, раздел 3).
const CRAM_RETRY_GAP = 7;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Цифра-герой (счёт сессии, прогноз): очень крупная, tabular, 800 — фирменный «маяк» экрана.
function HeroNumber({ value, label }: { value: string; label?: string }) {
  return (
    <VStack gap="3xs" align="center">
      <p className="m-0 font-headings text-(length:--stat-value-font-size) leading-(--stat-value-line-height) font-extrabold tracking-tight tabular-nums">
        {value}
      </p>
      {label && (
        <Text variant="mini" color="supplementary">
          {label}
        </Text>
      )}
    </VStack>
  );
}

// Центр ручки слайдера (28px) ходит с отступом 14px от краёв — заливка и засечки выровнены по нему.
function thumbCenterOf(ratio: number): string {
  return `calc(14px + (100% - 28px) * ${ratio})`;
}

interface BigSliderProps {
  /** Доля заливки 0..1 (по центру ручки). */
  ratio: number;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: number) => void;
  /** Позиции засечек долями 0..1 — точки на треке. */
  tickRatios?: readonly number[];
}

// Крупный слайдер: прозрачный input рисует только ручку, трек/заливку/засечки — слои под ним
// (у WebKit нет ::range-progress, иначе заливку слева от ручки не нарисовать).
function BigSlider({ ratio, min, max, step, value, disabled, ariaLabel, onChange, tickRatios }: BigSliderProps) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: thumbCenterOf(ratio) }} />
      </div>
      {tickRatios?.map((tickRatio) => (
        <span
          key={tickRatio}
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-card/90"
          style={{ left: thumbCenterOf(tickRatio) }}
        />
      ))}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        className="confidence-slider relative w-full"
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      />
    </div>
  );
}

// Ползунок уверенности: четыре шага до показа ответа — материал для калибровки метапознания.
const CONFIDENCE_STOPS: readonly { value: number; label: string }[] = [
  { value: 0, label: typo("наугад") },
  { value: 35, label: typo("не уверен") },
  { value: 70, label: typo("уверен") },
  { value: 100, label: typo("точно знаю") },
];

function ConfidencePicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const lastStop = CONFIDENCE_STOPS.length - 1;
  const index = Math.max(
    CONFIDENCE_STOPS.findIndex((stop) => stop.value === value),
    0,
  );

  return (
    <VStack gap="3xs">
      <Text variant="mini" color="supplementary">
        {typo("Насколько уверен в ответе?")}
      </Text>
      <BigSlider
        ratio={index / lastStop}
        min={0}
        max={lastStop}
        step={1}
        value={index}
        disabled={disabled}
        ariaLabel={typo("Уверенность в ответе")}
        tickRatios={CONFIDENCE_STOPS.map((_, stopIndex) => stopIndex / lastStop)}
        onChange={(nextIndex) => {
          const stop = CONFIDENCE_STOPS[nextIndex];
          if (stop) onChange(stop.value);
        }}
      />
      {/* Подписи засечек кликабельны; серединные — по центрам остановок ручки,
          крайние прижаты к краям панели, иначе их центрирование подрезает текст. */}
      <div className="relative h-5">
        {CONFIDENCE_STOPS.map((stop, stopIndex) => {
          const edgeClass = (): string => {
            if (stopIndex === 0) return "left-0 text-left";
            if (stopIndex === lastStop) return "right-0 text-right";
            return "-translate-x-1/2";
          };
          const middleOffset =
            stopIndex > 0 && stopIndex < lastStop ? { left: thumbCenterOf(stopIndex / lastStop) } : undefined;
          return (
            <button
              key={stop.value}
              type="button"
              disabled={disabled}
              className={`absolute top-0 whitespace-nowrap ${edgeClass()}`}
              style={middleOffset}
              onClick={() => {
                onChange(stop.value);
              }}
            >
              <Text
                variant="mini"
                bold={stop.value === value}
                color={stop.value === value ? "primary" : "supplementary"}
              >
                {stop.label}
              </Text>
            </button>
          );
        })}
      </div>
    </VStack>
  );
}

// Самооценка открытого ответа; перед сном — только «вспомнил/не вспомнил» (без давления).
const OPEN_RATINGS: readonly { rating: number; label: string }[] = [
  { rating: 1, label: typo("Снова") },
  { rating: 2, label: typo("Трудно") },
  { rating: 3, label: typo("Хорошо") },
  { rating: 4, label: typo("Легко") },
];

const BEDTIME_RATINGS: readonly { rating: number; label: string }[] = [
  { rating: 1, label: typo("Не вспомнил") },
  { rating: 3, label: typo("Вспомнил") },
];

function wrongVerdictText(kind: SessionKind): string {
  if (kind === "pretest") return typo("Мимо — так и задумано. Теперь запомнится лучше");
  if (kind === "bedtime") return typo("Не вспомнилось — ничего, ночью закрепится");
  return typo("Мимо — ничего страшного");
}

function RetryBlock({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <VStack gap="2xs" className="rounded-2xl border border-destructive/25 p-3">
      <Text variant="small" color="destructive">
        {label}
      </Text>
      <HStack>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {typo("Повторить")}
        </Button>
      </HStack>
    </VStack>
  );
}

interface AnswerInput {
  answerText?: string;
  selectedOption?: string;
  boolAnswer?: boolean;
}

// ИИ-сверка (Pro): вердикт haiku предзаполняет самооценку, человек может поправить.
// Тон вердикта — цветная точка (не заливка): спокойнее, «мимо» не кричит красным.
const AI_VERDICT_VIEW: Record<string, { label: string; dot: "success" | "warning" | "muted"; suggestedRating: number }> =
  {
    match: { label: typo("ИИ: совпадает по смыслу"), dot: "success", suggestedRating: 3 },
    partial: { label: typo("ИИ: частично совпало"), dot: "warning", suggestedRating: 2 },
    miss: { label: typo("ИИ: не совпало"), dot: "muted", suggestedRating: 1 },
  };

// «Объясни почему» (elaborative interrogation): свёрнуто по умолчанию, ненавязчиво.
// Показывается только с третьего показа карточки — гейт по repsBefore проверяет вызывающий.
function ExplainWhyBlock({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState("");

  const ask = useMutation({
    mutationFn: () => explainWhy({ data: { cardId, explanation: explanation.trim() } }),
    onError: (error) => {
      if (isPaywallError(error, "CHAT")) return;
      console.error(error);
      toast.error(typo("Не удалось проверить объяснение"));
    },
  });

  if (!open) {
    return (
      <HStack>
        <Button
          variant="link"
          size="inline"
          onClick={() => {
            setOpen(true);
          }}
        >
          {typo("Объяснить почему")}
        </Button>
      </HStack>
    );
  }

  return (
    <VStack gap="2xs" className="rounded-2xl bg-muted/50 p-3">
      <Text variant="mini" color="supplementary">
        {typo("Почему это так? Объясни своими словами — обоснование укрепляет память, а ИИ подсветит пробел.")}
      </Text>
      {ask.data ? (
        <Text variant="small" breakWords>
          {typo(ask.data.verdict)}
        </Text>
      ) : (
        <VStack gap="2xs">
          <Textarea
            value={explanation}
            rows={2}
            placeholder={typo("Потому что…")}
            onChange={(event) => {
              setExplanation(event.target.value);
            }}
          />
          <HStack gap="sm">
            <Button
              size="sm"
              variant="outline"
              disabled={!explanation.trim() || ask.isPending}
              onClick={() => {
                ask.mutate();
              }}
            >
              {ask.isPending ? typo("Оцениваем…") : typo("Проверить объяснение")}
            </Button>
          </HStack>
        </VStack>
      )}
      {isPaywallError(ask.error, "CHAT") && <PaywallCard reason="CHAT" compact />}
    </VStack>
  );
}

// Сцена карточки: тихие бейджи формата и темы + вопрос. Общая для припоминания и фидбека.
function CardScene({ card, children }: PropsWithChildren<{ card: SessionCard }>) {
  return (
    <SimpleCard size="lg">
      <VStack gap="lg">
        <VStack gap="sm">
          <HStack gap="sm" align="center" wrap>
            <Badge variant="dot" dot="primary">
              {cardFormatLabel(card.format)}
            </Badge>
            {card.topic && (
              <Badge variant="dot" dot="muted">
                {typo(card.topic)}
              </Badge>
            )}
          </HStack>
          {/* Все форматы держат один масштаб вопроса: cloze — Heading h3,
              markdown-промпты — вариант «prompt» с типографикой h3 у первого абзаца. */}
          {card.format === "cloze" ? (
            <Heading variant="h3" asParagraph breakWords>
              {typo(card.prompt)}
            </Heading>
          ) : (
            <MarkdownView variant="prompt">{card.prompt}</MarkdownView>
          )}
        </VStack>
        {children}
      </VStack>
    </SimpleCard>
  );
}

// Панель действий снизу: липнет к нижнему краю на длинных карточках, приподнята тенью.
function ActionPanel({ children }: PropsWithChildren) {
  return (
    <div className="sticky bottom-3 z-10 rounded-2xl bg-card p-4 shadow-card-hover sm:p-5">
      <VStack gap="md">{children}</VStack>
    </div>
  );
}

function CardPlayer({
  card,
  kind,
  onFinished,
}: {
  card: SessionCard;
  kind: SessionKind;
  onFinished: (outcome: CardOutcome) => void;
}) {
  const [confidence, setConfidence] = useState(35);
  const [typed, setTyped] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [startedAt] = useState(() => Date.now());

  // Перед сном — тихая тональность: главный CTA без градиентного «героя».
  const mainCtaVariant = kind === "bedtime" ? "secondary" : "brand";

  // Очередь не двигается, пока сервер не подтвердил ответ: при ошибке сети — ретрай на месте.
  const answer = useMutation({
    mutationFn: (input: AnswerInput) =>
      answerCard({
        data: {
          cardId: card.id,
          kind,
          confidence,
          durationMs: Math.min(Date.now() - startedAt, 3_600_000),
          answerText: typed.trim() || undefined,
          ...input,
        },
      }),
    onSuccess: setResult,
  });

  const rate = useMutation({
    mutationFn: (rating: number) =>
      submitOpenRating({
        data: {
          cardId: card.id,
          kind,
          rating,
          confidence,
          answerText: typed.trim() || undefined,
          // Вердикт ИИ-сверки уходит в журнал вместе с итоговой (возможно исправленной) оценкой.
          aiVerdict: result?.aiVerdict ?? null,
          durationMs: Math.min(Date.now() - startedAt, 3_600_000),
        },
      }),
    onSuccess: (graded) => {
      onFinished({ cardId: card.id, correct: graded.correct, confidence });
    },
  });

  const submitOption = (option: string) => {
    setSelectedOption(option);
    answer.mutate({ selectedOption: option });
  };

  // Контролы ответа для панели действий — по формату карточки.
  const recallControls = () => {
    if (card.format === "open") {
      return (
        <Button
          size="pill"
          variant={mainCtaVariant}
          className="w-full"
          disabled={answer.isPending}
          onClick={() => {
            answer.mutate({});
          }}
        >
          {typo("Показать ответ")}
        </Button>
      );
    }
    if (card.format === "mcq" || (card.format === "cloze" && card.options.length > 0)) {
      return (
        <VStack gap="2xs">
          {card.options.map((option) => (
            <Button
              key={option}
              variant="outline"
              disabled={answer.isPending}
              className="h-auto min-h-11 justify-start py-2.5 text-left whitespace-normal"
              onClick={() => {
                submitOption(option);
              }}
            >
              {typo(option)}
            </Button>
          ))}
        </VStack>
      );
    }
    if (card.format === "truefalse") {
      return (
        <AdaptiveGrid cols={{ base: 2 }} gap="sm">
          <Button
            size="lg"
            variant="outline"
            disabled={answer.isPending}
            onClick={() => {
              answer.mutate({ boolAnswer: true });
            }}
          >
            {typo("Верно")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={answer.isPending}
            onClick={() => {
              answer.mutate({ boolAnswer: false });
            }}
          >
            {typo("Неверно")}
          </Button>
        </AdaptiveGrid>
      );
    }
    // Cloze без вариантов: ввод пропущенного слова.
    return (
      <HStack gap="sm" align="center" wrap>
        <Input
          value={typed}
          placeholder={typo("Пропущенное слово")}
          className="max-w-xs flex-1"
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && typed.trim() && !answer.isPending) {
              answer.mutate({ answerText: typed.trim() });
            }
          }}
        />
        <Button
          variant={mainCtaVariant}
          disabled={answer.isPending || !typed.trim()}
          onClick={() => {
            answer.mutate({ answerText: typed.trim() });
          }}
        >
          {typo("Ответить")}
        </Button>
      </HStack>
    );
  };

  // Фаза припоминания: ответа на экране нет, сцена сверху, действия — в панели снизу.
  const renderRecall = () => (
    <VStack gap="md">
      <CardScene card={card}>
        {card.format === "open" && (
          <VStack gap="sm">
            <Text variant="small" color="supplementary">
              {typo("Сначала вспомни ответ. Скажи его себе или запиши — усилие припоминания и есть запоминание.")}
            </Text>
            <Textarea
              value={typed}
              rows={3}
              placeholder={typo("Можно набросать ответ здесь (необязательно)")}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </VStack>
        )}
      </CardScene>
      <ActionPanel>
        <ConfidencePicker value={confidence} onChange={setConfidence} disabled={answer.isPending} />
        {recallControls()}
        {answer.isError && (
          <RetryBlock
            label={typo("Не получилось отправить ответ — проверь сеть.")}
            onRetry={() => {
              if (answer.variables) answer.mutate(answer.variables);
            }}
          />
        )}
      </ActionPanel>
    </VStack>
  );

  // Спокойный фидбек вариантов: верный — зелёный, свой промах — мягкий янтарный (не красный).
  const optionFeedbackClass = (option: string, graded: AnswerResult): string => {
    if (option === graded.answer) return "border-success/60 bg-success/10";
    if (option === selectedOption) return "border-warning/60 bg-warning/10";
    return "opacity-55";
  };

  // Фаза обратной связи: вердикт, эталон, «почему» и источник — сразу после ответа.
  const renderFeedback = (graded: AnswerResult) => {
    const isOpenReveal = graded.correct === null;
    const showFlash = graded.correct === true && kind !== "bedtime";
    const aiView = graded.aiVerdict ? AI_VERDICT_VIEW[graded.aiVerdict] : null;

    const verdictBadge = () => {
      if (isOpenReveal) {
        // ИИ-сверка открытого ответа: вердикт вместо пустоты, самооценка остаётся за человеком.
        if (!aiView) return null;
        return (
          <Badge variant="dot" dot={aiView.dot}>
            {aiView.label}
          </Badge>
        );
      }
      if (graded.correct) {
        return <Badge className="bg-success/15 text-success">{typo("Верно!")}</Badge>;
      }
      // Неверно — спокойная нейтральная точка вместо красной заливки: без «красного стыда».
      return (
        <Badge variant="dot" dot="warning">
          {wrongVerdictText(kind)}
        </Badge>
      );
    };

    const ratings = kind === "bedtime" ? BEDTIME_RATINGS : OPEN_RATINGS;
    // Предзаполненная самооценка из вердикта ИИ — подсвечиваем предложенную кнопку.
    const suggestedRating = kind === "bedtime" ? null : (aiView?.suggestedRating ?? null);

    return (
      <VStack gap="md">
        {showFlash && <div aria-hidden className="good-pulse pointer-events-none fixed inset-0 z-10 bg-success/15" />}
        <CardScene card={card}>
          <HStack wrap>{verdictBadge()}</HStack>

          {card.format === "mcq" && card.options.length > 0 ? (
            <VStack gap="2xs">
              {card.options.map((option) => (
                <div
                  key={option}
                  className={`rounded-lg border border-input px-4 py-2.5 ${optionFeedbackClass(option, graded)}`}
                >
                  <Text variant="small" breakWords>
                    {typo(option)}
                  </Text>
                </div>
              ))}
            </VStack>
          ) : (
            <VStack gap="2xs">
              {isOpenReveal && typed.trim() && (
                <VStack gap="3xs">
                  <Text variant="mini" color="supplementary">
                    {typo("Твой ответ")}
                  </Text>
                  <Text variant="small" breakWords>
                    {typo(typed.trim())}
                  </Text>
                </VStack>
              )}
              <VStack gap="3xs" className="rounded-2xl bg-muted/50 p-3">
                <Text variant="mini" color="supplementary">
                  {typo("Эталонный ответ")}
                </Text>
                {card.format === "open" ? (
                  <MarkdownView>{graded.answer}</MarkdownView>
                ) : (
                  <Text bold breakWords>
                    {formatClosedAnswer(card.format, graded.answer)}
                  </Text>
                )}
              </VStack>
            </VStack>
          )}

          {aiView && graded.aiComment && (
            <Text variant="small" color="supplementary" breakWords>
              {typo(graded.aiComment)}
            </Text>
          )}
          {graded.explanation && (
            <Text variant="small" color="supplementary" breakWords>
              {typo(graded.explanation)}
            </Text>
          )}
          {graded.sourceRef && (
            <Text variant="mini" color="supplementary" breakWords>
              {typo(`Из твоего конспекта: ${graded.sourceRef}`)}
            </Text>
          )}

          {graded.palace && <PalaceBlock title={graded.palace.title} loci={graded.palace.loci} />}

          {kind !== "bedtime" && graded.repsBefore >= EXPLAIN_WHY_MIN_REPS && <ExplainWhyBlock cardId={card.id} />}
        </CardScene>

        <ActionPanel>
          {isOpenReveal ? (
            <VStack gap="2xs">
              <Text variant="mini" color="supplementary">
                {suggestedRating
                  ? typo("ИИ предлагает оценку — поправь, если не согласен")
                  : typo("Насколько точно вспомнил?")}
              </Text>
              <AdaptiveGrid cols={{ base: 2, md: ratings.length === 2 ? 2 : 4 }} gap="xs">
                {ratings.map((option) => (
                  <Button
                    key={option.rating}
                    variant={option.rating === suggestedRating ? "secondary" : "outline"}
                    size="lg"
                    disabled={rate.isPending}
                    onClick={() => {
                      rate.mutate(option.rating);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </AdaptiveGrid>
              {rate.isError && (
                <RetryBlock
                  label={typo("Не получилось сохранить оценку — проверь сеть.")}
                  onRetry={() => {
                    if (rate.variables !== undefined) rate.mutate(rate.variables);
                  }}
                />
              )}
            </VStack>
          ) : (
            <Button
              size="pill"
              variant={mainCtaVariant}
              className="w-full"
              onClick={() => {
                onFinished({ cardId: card.id, correct: graded.correct, confidence });
              }}
            >
              {typo("Дальше")}
            </Button>
          )}
        </ActionPanel>
      </VStack>
    );
  };

  return result ? renderFeedback(result) : renderRecall();
}

function formatClosedAnswer(format: string, answer: string): string {
  if (format !== "truefalse") return typo(answer);
  return answer === "true" ? typo("Верно") : typo("Неверно");
}

// Защита сна в зубрёжке: после 23:00 МСК предлагаем завершить — сон важнее ещё одного круга.
function SleepGate({ onFinish, onMore }: { onFinish: () => void; onMore: () => void }) {
  return (
    <SimpleCard size="lg">
      <EmptyState
        illustration="moon"
        title={typo("Пора спать")}
        text={typo("Сон важнее ещё одного круга: во сне память закрепляет выученное. Утром будет короткое повторение.")}
      >
        <HStack gap="sm" justify="center" wrap>
          <Button onClick={onFinish}>{typo("Завершить")}</Button>
          <Button variant="outline" onClick={onMore}>
            {typo("Ещё 5 карточек")}
          </Button>
        </HStack>
      </EmptyState>
    </SimpleCard>
  );
}

// «Прогноз против факта»: пропускаемый экран перед первой карточкой daily-сессии.
// Ошибка сохранения не блокирует занятие — прогноз вторичен относительно самой сессии.
function ForecastGate({ examId, totalCards, onDone }: { examId: string; totalCards: number; onDone: () => void }) {
  const [percent, setPercent] = useState(70);
  const create = useMutation({
    mutationFn: () => createForecast({ data: { examId, predictedPercent: percent } }),
    onSuccess: onDone,
    onError: () => {
      toast.error(typo("Не удалось сохранить прогноз — продолжаем без него"));
      onDone();
    },
  });
  const expectedCards = Math.round((totalCards * percent) / 100);

  return (
    <SimpleCard size="lg">
      <VStack gap="lg">
        <VStack gap="2xs">
          <Heading variant="h3" asParagraph>
            {typo(`Прогноз: сколько из ${totalCards} карточек ты сегодня вспомнишь?`)}
          </Heading>
          <Text variant="small" color="supplementary">
            {typo(
              "Предскажи результат до сессии — в конце сравним с фактом. Так самооценка учится не верить ощущению «я это знаю».",
            )}
          </Text>
        </VStack>
        <VStack gap="2xs">
          <HStack justify="between" align="end" gap="md">
            <HeroNumber value={`${percent}%`} />
            <Text variant="small" color="supplementary">
              {typo(`примерно ${expectedCards} из ${totalCards}`)}
            </Text>
          </HStack>
          <BigSlider
            ratio={percent / 100}
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={create.isPending}
            ariaLabel={typo("Прогноз вспомненных карточек в процентах")}
            onChange={setPercent}
          />
        </VStack>
        <HStack gap="sm" wrap>
          <Button
            size="pill"
            variant="brand"
            disabled={create.isPending}
            onClick={() => {
              create.mutate();
            }}
          >
            {typo("Записать прогноз")}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {typo("Не сейчас")}
          </Button>
        </HStack>
      </VStack>
    </SimpleCard>
  );
}

// Честный комментарий к разнице «прогноз − факт» (в процентных пунктах).
function forecastCommentOf(deltaPp: number): string {
  if (deltaPp >= 10) {
    return typo(
      "Переоценка: материал казался знакомее, чем вспомнился. Это иллюзия беглости — продолжай сверять ощущения с фактом.",
    );
  }
  if (deltaPp <= -10) {
    return typo("Недооценка: ты знаешь больше, чем ощущаешь. Можно доверять себе чуть смелее.");
  }
  return typo("Точный прогноз — самооценка хорошо откалибрована.");
}

function emptyQueueText(kind: SessionKind): string {
  const texts: Record<SessionKind, string> = {
    daily: typo("На сейчас всё повторено: план выполнен или карточки ещё не созрели. Загляни позже."),
    pretest: typo("Новых карточек нет — претест проходят до изучения. Добавь вопросы или дождись генерации."),
    bedtime: typo("Предсонное повторение собирается из карточек, пройденных за день. Сначала пройди дневную сессию."),
    cram: typo("Карточек для зубрёжки нет — добавь вопросы и сгенерируй карточки."),
  };
  return texts[kind];
}

// Иллюстрация пустой очереди — по тональности режима.
const EMPTY_QUEUE_ILLUSTRATIONS: Record<SessionKind, "cards" | "calendar" | "moon"> = {
  daily: "calendar",
  pretest: "cards",
  bedtime: "moon",
  cram: "cards",
};

function SessionSummary({
  examId,
  kind,
  outcomes,
  readinessBefore,
  onRestart,
}: {
  examId: string;
  kind: SessionKind;
  outcomes: readonly CardOutcome[];
  readinessBefore: number;
  onRestart: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const plan = useQuery(examQueries.todayPlan());

  const total = outcomes.length;
  const correct = outcomes.filter((outcome) => outcome.correct).length;
  const confidentMisses = outcomes.filter((outcome) => !outcome.correct && (outcome.confidence ?? 0) >= 70).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  // Прогноз резолвится фактом сессии; нет висящего прогноза — сервер вернёт null, блока не будет.
  const resolve = useMutation({
    mutationFn: () => resolveForecast({ data: { examId, actualPercent: accuracy } }),
  });

  // Сессия меняет готовность и план — обновляем их сразу после финиша.
  useMountEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    if (kind === "daily" && total) resolve.mutate();
  });

  // Перед сном — не праздник, а тихое «до завтра»: луна и никаких салютов.
  if (kind === "bedtime") {
    return (
      <SimpleCard size="lg">
        <EmptyState
          illustration="moon"
          title={typo("Готово. Хороших снов")}
          text={typo(
            `Повторено ${cardsCountLabel(total)} — ночью память закрепит выученное, утром будет короткое повторение.`,
          )}
        >
          <Button size="pill" variant="secondary" onClick={() => void navigate({ to: "/app" })}>
            {typo("К плану")}
          </Button>
        </EmptyState>
      </SimpleCard>
    );
  }

  const forecast = resolve.data;

  const planData = plan.data;
  const planDone = planData ? !planData.planTotal && planData.cardsDoneToday > 0 : false;
  const nextBlock = planData?.plan.find((block) => block.examId !== examId && block.cardIds.length);
  const nextTitle = nextBlock ? planData?.exams.find((summary) => summary.examId === nextBlock.examId)?.title : null;

  const heading = () => {
    if (planDone && planData) {
      return typo(
        `День засчитан 🔥 Серия: ${planData.streakDays} ${pluralRu(planData.streakDays, "день", "дня", "дней")}`,
      );
    }
    return typo("Сессия завершена");
  };

  return (
    <SimpleCard size="lg">
      <VStack gap="xl" align="center" className="py-2 text-center">
        <div className="relative">
          {/* Конфетти-бёрст при закрытом плане дня: одноразовый, в брендовых цветах. */}
          {planDone && (
            <div aria-hidden className="confetti-burst">
              {Array.from({ length: 12 }, (_, particleIndex) => (
                <span key={particleIndex} />
              ))}
            </div>
          )}
          <Heading variant="h2" asParagraph align="center">
            {heading()}
          </Heading>
        </div>

        <HStack gap="2xl" justify="center" align="start" wrap>
          <HeroNumber value={typo(`${correct} из ${total}`)} label={typo("вспомнил")} />
          <HeroNumber value={`${accuracy}%`} label={typo("точность")} />
        </HStack>

        {/* Группа колец центрируется явно (в VStack «justify» — поперечная ось);
            текстовый дубль «было → стало» убран — цифры уже в кольцах. */}
        <VStack gap="2xs" justify="center">
          <HStack gap="md" align="center" justify="center">
            <VStack gap="3xs" justify="center">
              <ReadinessRing value={readinessBefore} size="sm" />
              <Text variant="mini" color="supplementary">
                {typo("было")}
              </Text>
            </VStack>
            <MoveRight aria-hidden className="size-6 text-muted-foreground" strokeWidth={1.8} />
            <VStack gap="3xs" justify="center">
              <ReadinessRing value={exam.readiness} size="lg" />
              <Text variant="mini" color="supplementary">
                {typo("стало")}
              </Text>
            </VStack>
          </HStack>
          <Text variant="mini" color="supplementary">
            {typo("готовность экзамена")}
          </Text>
          {confidentMisses > 0 && (
            <Text variant="small" color="supplementary">
              {typo(`Уверенных промахов: ${confidentMisses} — эти карточки попадут в приоритет завтра.`)}
            </Text>
          )}
        </VStack>

        {forecast && (
          <VStack gap="3xs" align="center" className="w-full rounded-2xl bg-primary/5 p-4">
            <Text bold>{typo(`Ты ожидал ${forecast.predictedPercent}% — вспомнил ${forecast.actualPercent}%`)}</Text>
            <Text variant="small" color="supplementary">
              {forecastCommentOf(forecast.predictedPercent - forecast.actualPercent)}
            </Text>
          </VStack>
        )}

        {isWalkNudgeDay(mskDayKey(new Date())) && (
          <HStack gap="2xs" align="center" justify="center">
            <Footprints aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.8} />
            <Text variant="mini" color="supplementary">
              {typo("Короткая прогулка после занятия помогает закреплению.")}
            </Text>
          </HStack>
        )}

        <VStack gap="sm" align="center" className="w-full">
          {nextBlock && nextTitle && (
            <Button
              size="pill"
              variant="brand"
              className="w-full sm:w-auto"
              onClick={() => {
                void navigate({
                  to: "/app/exams/$examId/session",
                  params: { examId: nextBlock.examId },
                  search: { kind: "daily" },
                });
              }}
            >
              {typo(`Дальше: ${nextTitle} (${cardsCountLabel(nextBlock.cardIds.length)})`)}
            </Button>
          )}
          <HStack gap="sm" justify="center" wrap>
            {!nextBlock && (
              <Button variant="outline" onClick={onRestart}>
                {typo("Ещё сессия")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void navigate({ to: "/app" })}>
              {typo("К плану")}
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </SimpleCard>
  );
}

function SessionPage() {
  const { examId } = Route.useParams();
  const { kind } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const session = useQuery(examQueries.session(examId, kind));
  // Прогноз предлагаем только в daily; ответ читается один раз (staleTime — навсегда).
  const forecastPrompt = useQuery({ ...examQueries.forecastPrompt(examId), enabled: kind === "daily" });

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<CardOutcome[]>([]);
  // Живая очередь: в cram ошибки возвращаются в неё повторным показом; null — очередь сервера как есть.
  const [extendedCards, setExtendedCards] = useState<SessionCard[] | null>(null);
  const [forceFinished, setForceFinished] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  // Порог защиты сна: гейт показывается, когда отвечено ≥ порога (0 — сразу при входе ночью).
  const [sleepGateThreshold, setSleepGateThreshold] = useState(0);
  const [readinessBefore] = useState(exam.readiness);
  // Экран прогноза закрыт (записан или пропущен) — не показываем повторно и после «ещё сессии».
  const [forecastClosed, setForecastClosed] = useState(false);
  // Мягкое предложение перерыва после 40 минут занятий подряд.
  const [breakNudge, setBreakNudge] = useState(false);
  // Исход карточки, играющей анимацию ухода: очередь двинется по animationend.
  const [leavingOutcome, setLeavingOutcome] = useState<CardOutcome | null>(null);

  const exitToHub = () => {
    void navigate({ to: "/app/exams/$examId", params: { examId } });
  };

  const restart = () => {
    queryClient.removeQueries({ queryKey: ["session", examId, kind] });
    setIndex(0);
    setOutcomes([]);
    setExtendedCards(null);
    setForceFinished(false);
    setSleepGateThreshold(0);
    setLeavingOutcome(null);
  };

  if (session.isLoading) {
    return (
      <VStack gap="lg" className="mx-auto w-full max-w-2xl">
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-muted" />
        <div className="h-2 animate-pulse rounded-full bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </VStack>
    );
  }
  if (session.error) {
    if (isPaywallError(session.error, "CRAM")) return <PaywallCard reason="CRAM" />;
    return (
      <VStack gap="md" className="mx-auto w-full max-w-2xl">
        <Text color="supplementary">{typo("Не удалось начать сессию — проверь сеть и попробуй ещё раз.")}</Text>
        <HStack gap="sm">
          <Button onClick={() => void session.refetch()}>{typo("Повторить")}</Button>
          <Button variant="outline" onClick={exitToHub}>
            {typo("К экзамену")}
          </Button>
        </HStack>
      </VStack>
    );
  }
  const queue = session.data;
  if (!queue) return null;

  const cards = extendedCards ?? queue.cards;
  const card = cards[index];
  const finished = forceFinished || !card;
  const answered = outcomes.length;
  const showSleepGate = kind === "cram" && !finished && isSleepTimeMsk(new Date()) && answered >= sleepGateThreshold;

  // Cram: ошибка возвращается в очередь через CRAM_RETRY_GAP позиций; пока повтор этой же
  // карточки уже ждёт впереди, второй не добавляем (иначе очередь пухла бы дублями).
  const requeueCramMiss = (missIndex: number) => {
    setExtendedCards((current) => {
      const base = current ?? queue.cards;
      const missed = base[missIndex];
      if (!missed) return current;
      if (base.slice(missIndex + 1).some((pending) => pending.id === missed.id)) return current;
      const insertAt = Math.min(missIndex + CRAM_RETRY_GAP, base.length);
      return [...base.slice(0, insertAt), missed, ...base.slice(insertAt)];
    });
  };

  // Продвижение очереди: вызывается после анимации ухода карточки (или сразу без анимации).
  const advanceQueue = (outcome: CardOutcome) => {
    setOutcomes((current) => [...current, outcome]);
    if (kind === "cram" && !outcome.correct) requeueCramMiss(index);
    setIndex((current) => current + 1);
    // Привычка «понемногу, но часто»: после 40 минут подряд — мягкое предложение паузы.
    recordFocusActivity();
    if (shouldSuggestFocusBreak()) {
      markFocusBreakShown();
      setBreakNudge(true);
    }
  };

  // Смена карточек slide+fade. При reduced-motion animationend не придёт — двигаемся сразу.
  const handleCardFinished = (outcome: CardOutcome) => {
    if (reducedMotion()) {
      advanceQueue(outcome);
      return;
    }
    setLeavingOutcome(outcome);
  };

  const handleExit = () => {
    if (finished || !answered) {
      exitToHub();
      return;
    }
    setExitConfirm(true);
  };

  const renderBody = () => {
    if (!cards.length) {
      return (
        <SimpleCard size="lg">
          <EmptyState
            illustration={EMPTY_QUEUE_ILLUSTRATIONS[kind]}
            title={typo("Сейчас повторять нечего")}
            text={emptyQueueText(kind)}
          >
            <HStack gap="sm" justify="center" wrap>
              <Button onClick={() => void navigate({ to: "/app" })}>{typo("К плану")}</Button>
              <Button variant="outline" onClick={exitToHub}>
                {typo("К экзамену")}
              </Button>
            </HStack>
          </EmptyState>
        </SimpleCard>
      );
    }
    if (finished) {
      return (
        <SessionSummary
          examId={examId}
          kind={kind}
          outcomes={outcomes}
          readinessBefore={readinessBefore}
          onRestart={restart}
        />
      );
    }
    if (kind === "daily" && !outcomes.length && !forecastClosed && forecastPrompt.data?.shouldPrompt) {
      return (
        <ForecastGate
          examId={examId}
          totalCards={queue.cards.length}
          onDone={() => {
            setForecastClosed(true);
          }}
        />
      );
    }
    if (showSleepGate) {
      return (
        <SleepGate
          onFinish={() => {
            setForceFinished(true);
          }}
          onMore={() => {
            setSleepGateThreshold(answered + 5);
          }}
        />
      );
    }
    if (!card) return null;
    return (
      // Индекс в ключе обязателен: в cram повтор той же карточки может идти следом,
      // и без него React не размонтировал бы плеер с уже показанным ответом.
      <div
        key={`${index}-${card.id}`}
        className={leavingOutcome ? "card-leave pointer-events-none" : "card-enter"}
        onAnimationEnd={(event) => {
          if (event.animationName !== "card-leave" || !leavingOutcome) return;
          const outcome = leavingOutcome;
          setLeavingOutcome(null);
          advanceQueue(outcome);
        }}
      >
        <CardPlayer card={card} kind={kind} onFinished={handleCardFinished} />
      </div>
    );
  };

  return (
    <VStack gap="md" className="mx-auto w-full max-w-2xl">
      <HStack justify="between" align="center" gap="md">
        <VStack gap="3xs">
          <HStack gap="xs" align="center" wrap>
            <Heading variant="h3" asParagraph>
              {SESSION_KIND_TITLES[kind]}
            </Heading>
            {kind === "cram" && (
              <Badge variant="dot" dot="flame">
                {typo("умная зубрёжка")}
              </Badge>
            )}
          </HStack>
          <Text variant="mini" color="supplementary" maxLines={1}>
            {typo(queue.examTitle)}
          </Text>
        </VStack>
        <HStack gap="sm" align="center">
          {cards.length > 0 && !finished && (
            <Text variant="small" color="supplementary">
              {typo(`${Math.min(index + 1, cards.length)} из ${cards.length}`)}
            </Text>
          )}
          <Button variant="ghost" size="icon" aria-label={typo("Выйти из сессии")} onClick={handleExit}>
            <X className="size-5" />
          </Button>
        </HStack>
      </HStack>

      {cards.length > 0 && <SegmentedProgress total={cards.length} value={index} />}

      {kind === "pretest" && !finished && cards.length > 0 && (
        <SimpleCard className="border border-primary/20 bg-primary/5 shadow-none">
          <Text variant="small" color="supplementary">
            {typo(
              "Сначала бой: ты ещё не учил это — ошибаться сейчас нормально и полезно. Мозг запомнит ответ крепче.",
            )}
          </Text>
        </SimpleCard>
      )}

      {kind === "bedtime" && !finished && cards.length > 0 && (
        <HStack gap="2xs" align="center">
          <Moon aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.8} />
          <Text variant="mini" color="supplementary">
            {typo("Спокойный режим: без новых тем, только закрепление пройденного за день.")}
          </Text>
        </HStack>
      )}

      {breakNudge && !finished && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <Coffee className="size-5 text-muted-foreground" strokeWidth={1.8} />
              <VStack gap="3xs">
                <Text bold>{typo("Уже больше 40 минут подряд — пора сделать паузу")}</Text>
                <Text variant="mini" color="supplementary">
                  {typo(
                    "25–50 минут фокуса + перерыв — так работает лучше. Пройди карточку и отвлекись на пару минут.",
                  )}
                </Text>
              </VStack>
            </HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBreakNudge(false);
              }}
            >
              {typo("Хорошо")}
            </Button>
          </HStack>
        </SimpleCard>
      )}

      {renderBody()}

      <ConfirmDialog
        open={exitConfirm}
        onOpenChange={setExitConfirm}
        title={typo("Прервать сессию?")}
        description={typo("Ответы по пройденным карточкам уже сохранены — остальные вернутся в план.")}
        confirmLabel={typo("Выйти")}
        onConfirm={exitToHub}
      />
    </VStack>
  );
}
