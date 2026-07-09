import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Moon, X, Zap } from "lucide-react";
import { useState } from "react";

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
import { isPaywallError, typo, zodRussian } from "~/lib";
import { answerCard, type AnswerResult, type SessionCard, submitOpenRating } from "~/server/fn/session";

import {
  cardsCountLabel,
  examQueries,
  isSleepTimeMsk,
  pluralRu,
  SESSION_KIND_TITLES,
  type SessionKind,
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

// Ползунок уверенности: четыре шага до показа ответа — материал для калибровки метапознания.
const CONFIDENCE_STOPS: readonly { value: number; label: string }[] = [
  { value: 0, label: typo("наугад") },
  { value: 35, label: typo("не уверен") },
  { value: 70, label: typo("уверен") },
  { value: 100, label: typo("точно знаю") },
];

function ConfidencePicker({ value, onChange, disabled }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
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
          <Text key={stop.value} variant="mini" color={stop.value === value ? "primary" : "supplementary"} bold={stop.value === value}>
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

function CardPlayer({ card, kind, onFinished }: { card: SessionCard; kind: SessionKind; onFinished: (outcome: CardOutcome) => void }) {
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
                  className="h-auto justify-start py-2 whitespace-normal text-left"
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

    const verdictBadge = () => {
      if (isOpenReveal) return null;
      if (graded.correct) {
        return <Badge className="bg-success/15 text-success">{typo("Верно!")}</Badge>;
      }
      return <Badge className="bg-destructive/15 text-destructive">{wrongVerdictText(kind)}</Badge>;
    };

    const ratings = kind === "bedtime" ? BEDTIME_RATINGS : OPEN_RATINGS;

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
                <div key={option} className={`rounded-md border border-input px-4 py-2 ${optionFeedbackClass(option, graded)}`}>
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

          {isOpenReveal ? (
            <VStack gap="2xs">
              <Text variant="mini" color="supplementary">
                {typo("Насколько точно вспомнил?")}
              </Text>
              <HStack gap="2xs" wrap>
                {ratings.map((option) => (
                  <Button
                    key={option.rating}
                    variant="outline"
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

  // Сессия меняет готовность и план — обновляем их сразу после финиша.
  useMountEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
  });

  const total = outcomes.length;
  const correct = outcomes.filter((outcome) => outcome.correct).length;
  const confidentMisses = outcomes.filter((outcome) => !outcome.correct && (outcome.confidence ?? 0) >= 70).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const planData = plan.data;
  const planDone = planData ? !planData.planTotal && planData.cardsDoneToday > 0 : false;
  const nextBlock = planData?.plan.find((block) => block.examId !== examId && block.cardIds.length);
  const nextTitle = nextBlock ? planData?.exams.find((summary) => summary.examId === nextBlock.examId)?.title : null;

  const heading = () => {
    if (kind === "bedtime") return typo("Готово. Хороших снов — память закрепится ночью");
    if (planDone && planData) {
      return typo(`День засчитан 🔥 Серия: ${planData.streakDays} ${pluralRu(planData.streakDays, "день", "дня", "дней")}`);
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
          <Text>
            {typo(`Вспомнил ${correct} из ${total} · точность ${accuracy}%`)}
          </Text>
          <Text variant="small" color="supplementary">
            {typo(`Готовность экзамена: ${Math.round(readinessBefore * 100)}% → ${Math.round(exam.readiness * 100)}%`)}
          </Text>
          {confidentMisses > 0 && (
            <Text variant="small" color="supplementary">
              {typo(
                `Уверенных промахов: ${confidentMisses} — эти карточки попадут в приоритет завтра.`,
              )}
            </Text>
          )}
        </VStack>
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

  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<CardOutcome[]>([]);
  const [forceFinished, setForceFinished] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  // Порог защиты сна: гейт показывается, когда отвечено ≥ порога (0 — сразу при входе ночью).
  const [sleepGateThreshold, setSleepGateThreshold] = useState(0);
  const [readinessBefore] = useState(exam.readiness);

  const exitToHub = () => {
    void navigate({ to: "/app/exams/$examId", params: { examId } });
  };

  const restart = () => {
    queryClient.removeQueries({ queryKey: ["session", examId, kind] });
    setIndex(0);
    setOutcomes([]);
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

  const card = queue.cards[index];
  const finished = forceFinished || !card;
  const answered = outcomes.length;
  const showSleepGate = kind === "cram" && !finished && isSleepTimeMsk(new Date()) && answered >= sleepGateThreshold;

  const handleExit = () => {
    if (finished || !answered) {
      exitToHub();
      return;
    }
    setExitConfirm(true);
  };

  const renderBody = () => {
    if (!queue.cards.length) {
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
      return <SessionSummary examId={examId} kind={kind} outcomes={outcomes} readinessBefore={readinessBefore} onRestart={restart} />;
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
      <div key={card.id} className="page-enter">
        <CardPlayer
          card={card}
          kind={kind}
          onFinished={(outcome) => {
            setOutcomes((current) => [...current, outcome]);
            setIndex((current) => current + 1);
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
          {queue.cards.length > 0 && !finished && (
            <Text variant="small" color="supplementary">
              {typo(`${Math.min(index + 1, queue.cards.length)} из ${queue.cards.length}`)}
            </Text>
          )}
          <Button variant="ghost" size="icon" aria-label={typo("Выйти из сессии")} onClick={handleExit}>
            <X className="size-5" />
          </Button>
        </HStack>
      </HStack>

      {queue.cards.length > 0 && <ProgressBar value={queue.cards.length ? index / queue.cards.length : 0} />}

      {kind === "pretest" && !finished && queue.cards.length > 0 && (
        <SimpleCard className="border border-primary/25 bg-primary/5">
          <Text variant="small" color="supplementary">
            {typo("Сначала бой: ты ещё не учил это — ошибаться сейчас нормально и полезно. Мозг запомнит ответ крепче.")}
          </Text>
        </SimpleCard>
      )}

      {kind === "bedtime" && !finished && queue.cards.length > 0 && (
        <HStack gap="2xs" align="center">
          <Moon className="size-4 text-muted-foreground" />
          <Text variant="mini" color="supplementary">
            {typo("Спокойный режим: без новых тем, только закрепление пройденного за день.")}
          </Text>
        </HStack>
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
