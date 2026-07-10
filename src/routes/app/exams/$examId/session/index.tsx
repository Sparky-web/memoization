import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Coffee, Footprints, Moon, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ConfirmDialog,
  Heading,
  HStack,
  Input,
  MarkdownView,
  PaywallCard,
  ProgressBar,
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
  const index = Math.max(
    CONFIDENCE_STOPS.findIndex((stop) => stop.value === value),
    0,
  );
  return (
    <VStack gap="2xs">
      <input
        type="range"
        min={0}
        max={CONFIDENCE_STOPS.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        className="w-full accent-primary"
        aria-label={typo("Уверенность в ответе")}
        onChange={(event) => {
          const stop = CONFIDENCE_STOPS[Number(event.target.value)];
          if (stop) onChange(stop.value);
        }}
      />
      <HStack justify="between" gap="2xs">
        {CONFIDENCE_STOPS.map((stop) => (
          <Text
            key={stop.value}
            variant="mini"
            color={stop.value === value ? "primary" : "supplementary"}
            bold={stop.value === value}
          >
            {stop.label}
          </Text>
        ))}
      </HStack>
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
const AI_VERDICT_VIEW: Record<string, { label: string; className: string; suggestedRating: number }> = {
  match: { label: typo("ИИ: совпадает по смыслу"), className: "bg-success/15 text-success", suggestedRating: 3 },
  partial: { label: typo("ИИ: частично совпало"), className: "bg-warning/15 text-warning", suggestedRating: 2 },
  miss: { label: typo("ИИ: не совпало"), className: "bg-destructive/15 text-destructive", suggestedRating: 1 },
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
    <VStack gap="2xs" className="rounded-2xl border border-border p-3">
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

  // Фаза припоминания: ответа на экране нет, ввод зависит от формата.
  const renderRecall = () => (
    <SimpleCard size="lg">
      <VStack gap="lg">
        <VStack gap="2xs">
          {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
          {card.format === "cloze" ? (
            <Heading variant="h3" asParagraph breakWords>
              {typo(card.prompt)}
            </Heading>
          ) : (
            <MarkdownView>{card.prompt}</MarkdownView>
          )}
        </VStack>

        {card.format === "open" && (
          <VStack gap="md">
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
            <ConfidencePicker value={confidence} onChange={setConfidence} disabled={answer.isPending} />
            <HStack>
              <Button
                size="pill"
                disabled={answer.isPending}
                onClick={() => {
                  answer.mutate({});
                }}
              >
                {typo("Показать ответ")}
              </Button>
            </HStack>
          </VStack>
        )}

        {(card.format === "mcq" || (card.format === "cloze" && card.options.length > 0)) && (
          <VStack gap="md">
            <ConfidencePicker value={confidence} onChange={setConfidence} disabled={answer.isPending} />
            <VStack gap="2xs">
              {card.options.map((option) => (
                <Button
                  key={option}
                  variant="outline"
                  disabled={answer.isPending}
                  className="h-auto justify-start py-2 text-left whitespace-normal"
                  onClick={() => {
                    submitOption(option);
                  }}
                >
                  {typo(option)}
                </Button>
              ))}
            </VStack>
          </VStack>
        )}

        {card.format === "cloze" && !card.options.length && (
          <VStack gap="md">
            <ConfidencePicker value={confidence} onChange={setConfidence} disabled={answer.isPending} />
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
          </VStack>
        )}

        {card.format === "truefalse" && (
          <VStack gap="md">
            <ConfidencePicker value={confidence} onChange={setConfidence} disabled={answer.isPending} />
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
          </VStack>
        )}

        {answer.isError && (
          <RetryBlock
            label={typo("Не получилось отправить ответ — проверь сеть.")}
            onRetry={() => {
              if (answer.variables) answer.mutate(answer.variables);
            }}
          />
        )}
      </VStack>
    </SimpleCard>
  );

  const optionFeedbackClass = (option: string, graded: AnswerResult): string => {
    if (option === graded.answer) return "border-success bg-success/10";
    if (option === selectedOption) return "border-destructive bg-destructive/10";
    return "opacity-60";
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
        return <Badge className={aiView.className}>{aiView.label}</Badge>;
      }
      if (graded.correct) {
        return <Badge className="bg-success/15 text-success">{typo("Верно!")}</Badge>;
      }
      return <Badge className="bg-destructive/15 text-destructive">{wrongVerdictText(kind)}</Badge>;
    };

    const ratings = kind === "bedtime" ? BEDTIME_RATINGS : OPEN_RATINGS;
    // Предзаполненная самооценка из вердикта ИИ — подсвечиваем предложенную кнопку.
    const suggestedRating = kind === "bedtime" ? null : (aiView?.suggestedRating ?? null);

    return (
      <SimpleCard size="lg">
        {showFlash && <div aria-hidden className="good-pulse pointer-events-none fixed inset-0 z-10 bg-success/15" />}
        <VStack gap="lg">
          <VStack gap="2xs">
            {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
            {card.format === "cloze" ? (
              <Heading variant="h3" asParagraph breakWords>
                {typo(card.prompt)}
              </Heading>
            ) : (
              <MarkdownView>{card.prompt}</MarkdownView>
            )}
          </VStack>

          {verdictBadge()}

          {card.format === "mcq" && card.options.length > 0 ? (
            <VStack gap="2xs">
              {card.options.map((option) => (
                <div
                  key={option}
                  className={`rounded-md border border-input px-4 py-2 ${optionFeedbackClass(option, graded)}`}
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

          {isOpenReveal ? (
            <VStack gap="2xs">
              <Text variant="mini" color="supplementary">
                {suggestedRating
                  ? typo("ИИ предлагает оценку — поправь, если не согласен")
                  : typo("Насколько точно вспомнил?")}
              </Text>
              <HStack gap="2xs" wrap>
                {ratings.map((option) => (
                  <Button
                    key={option.rating}
                    variant={option.rating === suggestedRating ? "secondary" : "outline"}
                    disabled={rate.isPending}
                    onClick={() => {
                      rate.mutate(option.rating);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </HStack>
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
            <HStack>
              <Button
                size="pill"
                onClick={() => {
                  onFinished({ cardId: card.id, correct: graded.correct, confidence });
                }}
              >
                {typo("Дальше")}
              </Button>
            </HStack>
          )}
        </VStack>
      </SimpleCard>
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
      <VStack gap="md">
        <Moon className="size-8 text-muted-foreground" />
        <Heading variant="h3" asParagraph>
          {typo("Пора спать")}
        </Heading>
        <Text color="supplementary">
          {typo("Сон важнее ещё одного круга: во сне память закрепляет выученное. Утром будет короткое повторение.")}
        </Text>
        <HStack gap="sm" wrap>
          <Button onClick={onFinish}>{typo("Завершить")}</Button>
          <Button variant="outline" onClick={onMore}>
            {typo("Ещё 5 карточек")}
          </Button>
        </HStack>
      </VStack>
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
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={create.isPending}
            className="w-full accent-primary"
            aria-label={typo("Прогноз вспомненных карточек в процентах")}
            onChange={(event) => {
              setPercent(Number(event.target.value));
            }}
          />
          <HStack justify="between" align="center">
            <Text bold>{`${percent}%`}</Text>
            <Text variant="small" color="supplementary">
              {typo(`примерно ${expectedCards} из ${totalCards}`)}
            </Text>
          </HStack>
        </VStack>
        <HStack gap="sm" wrap>
          <Button
            size="pill"
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

  const forecast = resolve.data;

  const planData = plan.data;
  const planDone = planData ? !planData.planTotal && planData.cardsDoneToday > 0 : false;
  const nextBlock = planData?.plan.find((block) => block.examId !== examId && block.cardIds.length);
  const nextTitle = nextBlock ? planData?.exams.find((summary) => summary.examId === nextBlock.examId)?.title : null;

  const heading = () => {
    if (kind === "bedtime") return typo("Готово. Хороших снов — память закрепится ночью");
    if (planDone && planData) {
      return typo(
        `День засчитан 🔥 Серия: ${planData.streakDays} ${pluralRu(planData.streakDays, "день", "дня", "дней")}`,
      );
    }
    return typo("Сессия завершена");
  };

  return (
    <SimpleCard size="lg">
      <VStack gap="lg">
        <Heading variant="h2" asParagraph>
          {heading()}
        </Heading>
        <VStack gap="2xs">
          <Text>{typo(`Вспомнил ${correct} из ${total} · точность ${accuracy}%`)}</Text>
          <Text variant="small" color="supplementary">
            {typo(`Готовность экзамена: ${Math.round(readinessBefore * 100)}% → ${Math.round(exam.readiness * 100)}%`)}
          </Text>
          {confidentMisses > 0 && (
            <Text variant="small" color="supplementary">
              {typo(`Уверенных промахов: ${confidentMisses} — эти карточки попадут в приоритет завтра.`)}
            </Text>
          )}
        </VStack>
        {forecast && (
          <VStack gap="3xs" className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <Text bold>{typo(`Ты ожидал ${forecast.predictedPercent}% — вспомнил ${forecast.actualPercent}%`)}</Text>
            <Text variant="small" color="supplementary">
              {forecastCommentOf(forecast.predictedPercent - forecast.actualPercent)}
            </Text>
          </VStack>
        )}
        {kind !== "bedtime" && isWalkNudgeDay(mskDayKey(new Date())) && (
          <HStack gap="2xs" align="center">
            <Footprints className="size-4 text-muted-foreground" />
            <Text variant="mini" color="supplementary">
              {typo("Короткая прогулка после занятия помогает закреплению.")}
            </Text>
          </HStack>
        )}
        <HStack gap="sm" wrap>
          {nextBlock && nextTitle && kind !== "bedtime" && (
            <Button
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
          {kind !== "bedtime" && !nextBlock && (
            <Button variant="outline" onClick={onRestart}>
              {typo("Ещё сессия")}
            </Button>
          )}
          <Button
            variant={kind === "bedtime" ? "default" : "outline"}
            onClick={() => {
              void navigate({ to: "/app" });
            }}
          >
            {typo("К плану")}
          </Button>
        </HStack>
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
  };

  if (session.isLoading) {
    return (
      <VStack gap="lg">
        <div className="h-6 w-1/2 animate-pulse rounded-full bg-muted" />
        <div className="h-2 animate-pulse rounded-full bg-muted" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </VStack>
    );
  }
  if (session.error) {
    if (isPaywallError(session.error, "CRAM")) return <PaywallCard reason="CRAM" />;
    return (
      <VStack gap="md">
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
          <VStack gap="md">
            <Heading variant="h3" asParagraph>
              {typo("Сейчас повторять нечего")}
            </Heading>
            <Text color="supplementary">{emptyQueueText(kind)}</Text>
            <HStack gap="sm" wrap>
              <Button onClick={() => void navigate({ to: "/app" })}>{typo("К плану")}</Button>
              <Button variant="outline" onClick={exitToHub}>
                {typo("К экзамену")}
              </Button>
            </HStack>
          </VStack>
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
      <div key={`${index}-${card.id}`} className="page-enter">
        <CardPlayer
          card={card}
          kind={kind}
          onFinished={(outcome) => {
            setOutcomes((current) => [...current, outcome]);
            if (kind === "cram" && !outcome.correct) requeueCramMiss(index);
            setIndex((current) => current + 1);
            // Привычка «понемногу, но часто»: после 40 минут подряд — мягкое предложение паузы.
            recordFocusActivity();
            if (shouldSuggestFocusBreak()) {
              markFocusBreakShown();
              setBreakNudge(true);
            }
          }}
        />
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
              <Badge variant="primary">
                <Zap className="size-3" />
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

      {cards.length > 0 && <ProgressBar value={cards.length ? index / cards.length : 0} />}

      {kind === "pretest" && !finished && cards.length > 0 && (
        <SimpleCard className="border border-primary/25 bg-primary/5">
          <Text variant="small" color="supplementary">
            {typo(
              "Сначала бой: ты ещё не учил это — ошибаться сейчас нормально и полезно. Мозг запомнит ответ крепче.",
            )}
          </Text>
        </SimpleCard>
      )}

      {kind === "bedtime" && !finished && cards.length > 0 && (
        <HStack gap="2xs" align="center">
          <Moon className="size-4 text-muted-foreground" />
          <Text variant="mini" color="supplementary">
            {typo("Спокойный режим: без новых тем, только закрепление пройденного за день.")}
          </Text>
        </HStack>
      )}

      {breakNudge && !finished && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <Coffee className="size-5 text-muted-foreground" />
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
