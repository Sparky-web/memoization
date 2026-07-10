import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, Flame, Moon, Play, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Heading,
  HStack,
  Link,
  PaywallCard,
  ReadinessRing,
  SegmentedProgress,
  SimpleCard,
  Text,
  useMountEffect,
  VStack,
} from "~/components";
import { formatDateRuMsk, isPaywallError, mskDayKey, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";
import { archiveExam, deleteExam, setExamPaused, updateExam } from "~/server/fn/exams";

import {
  cardsCountLabel,
  daysToExamLabel,
  type ExamListItem,
  examQueries,
  type FavoriteExamItem,
  pluralRu,
  questionsCountLabel,
  type TodayPlan,
} from "./exams/_lib";

// «Сегодня» — главный экран: серия, план дня по экзаменам, предложения режимов
// и карточки состояний (генерация, ошибка, прошедший экзамен).

export const Route = createFileRoute("/app/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(examQueries.list()),
      context.queryClient.ensureQueryData(examQueries.todayPlan()),
      context.queryClient.ensureQueryData(examQueries.favorites()),
    ]),
  head: () => ({ meta: [{ title: typo("Сегодня") }] }),
  component: TodayPage,
});

// Скорость из планировщика: ~2 карточки в минуту — для оценки «~N минут».
const CARDS_PER_MINUTE = 2;

const CONFETTI_PARTICLE_COUNT = 12;
const DAY_CONFETTI_STORAGE_KEY = "domashnik:day-done-confetti";

// Конфетти «День засчитан»: одноразовый CSS-бёрст — не чаще раза в день (ключ дня в localStorage).
function DayDoneConfetti() {
  const [visible, setVisible] = useState(false);
  useMountEffect(() => {
    const dayKey = mskDayKey(new Date());
    if (localStorage.getItem(DAY_CONFETTI_STORAGE_KEY) === dayKey) return;
    localStorage.setItem(DAY_CONFETTI_STORAGE_KEY, dayKey);
    setVisible(true);
  });
  if (!visible) return null;
  return (
    <span aria-hidden className="confetti-burst">
      {Array.from({ length: CONFETTI_PARTICLE_COUNT }, (_, particleIndex) => (
        <span key={particleIndex} />
      ))}
    </span>
  );
}

// Эмоциональный верх «Сегодня»: колышущийся огонь серии и кольца готовности — герои экрана.
function TodayHero({ plan }: { plan: TodayPlan }) {
  const restNote = plan.restWeekdays.length
    ? typo(`дней отдыха в неделю: ${plan.restWeekdays.length}`)
    : typo("дни отдыха настраиваются");
  // Кольца — герои: пока экзаменов мало, они крупные; при трёх и больше — компактнее.
  const ringSize = plan.exams.length > 2 ? "md" : "lg";
  return (
    <SimpleCard size="lg">
      <HStack gap="xl" align="center" wrap>
        <HStack gap="md" align="center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-flame/15">
            <Flame className="flame-sway size-7 text-flame" strokeWidth={1.8} />
          </span>
          <VStack gap="3xs">
            <p className="m-0 font-headings text-(length:--stat-value-font-size) leading-(--stat-value-line-height) font-extrabold tracking-tight tabular-nums">
              {plan.streakDays}
            </p>
            <Text variant="small" color="supplementary">
              {typo(`${pluralRu(plan.streakDays, "день", "дня", "дней")} серии подряд`)}
            </Text>
            <Text variant="mini" color="supplementary">
              <span
                title={typo("Заморозка сама закрывает пропущенный день; 2 штуки на месяц. Дни отдыха серию не рвут.")}
              >
                {typo(`заморозки: ${plan.freezesLeft} · `)}
                <Link to="/app/settings" variant="underline">
                  {restNote}
                </Link>
              </span>
            </Text>
          </VStack>
        </HStack>
        {plan.exams.length > 0 && (
          <>
            <span aria-hidden className="hidden w-px self-stretch bg-border sm:block" />
            <HStack gap="lg" align="start" justify="evenly" wrap className="min-w-0 flex-1">
              {plan.exams.map((summary) => (
                <VStack key={summary.examId} gap="2xs" align="center" className="max-w-28">
                  <ReadinessRing value={summary.readiness} size={ringSize} />
                  <Link to={`/app/exams/${summary.examId}`}>
                    <Text variant="mini" color="supplementary" align="center" maxLines={2} breakWords>
                      {typo(summary.title)}
                    </Text>
                  </Link>
                </VStack>
              ))}
            </HStack>
          </>
        )}
      </HStack>
    </SimpleCard>
  );
}

// Блок плана по одному экзамену: карточка с подъёмом, клик по ней запускает сессию.
function PlanBlockCard({
  summary,
  cardCount,
  riseDelayMs,
  onStart,
}: {
  summary: TodayPlan["exams"][number];
  cardCount: number;
  riseDelayMs: number;
  onStart: () => void;
}) {
  const daysLabel = daysToExamLabel(summary.daysToExam);
  return (
    <SimpleCard interactive className="rise" style={{ animationDelay: `${riseDelayMs}ms` }} onClick={onStart}>
      <HStack justify="between" align="center" gap="md" wrap>
        <HStack gap="md" align="center">
          <ReadinessRing value={summary.readiness} size="sm" />
          <VStack gap="3xs">
            <Link
              to={`/app/exams/${summary.examId}`}
              className="font-semibold"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {typo(summary.title)}
            </Link>
            <Text variant="mini" color="supplementary">
              {[daysLabel, cardsCountLabel(cardCount)].filter(Boolean).join(" · ")}
            </Text>
          </VStack>
        </HStack>
        <Button variant="outline" size="sm">
          <Play className="size-4" strokeWidth={1.8} />
          {typo("Начать")}
        </Button>
      </HStack>
    </SimpleCard>
  );
}

// Прошедший экзамен: закрыть подготовку — архив, перевод в поддержку или удаление.
function ExamPassedCard({ exam }: { exam: ExamListItem }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
  };

  const archive = useMutation({
    mutationFn: () => archiveExam({ data: { id: exam.id, archived: true } }),
    onSuccess: () => {
      toast.success(typo("Экзамен в архиве"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось заархивировать экзамен"));
    },
  });
  const keepForever = useMutation({
    mutationFn: () => updateExam({ data: { id: exam.id, data: { examDate: null } } }),
    onSuccess: () => {
      toast.success(typo("Перевели в поддерживающее повторение — знания останутся с тобой"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить экзамен"));
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteExam({ data: { id: exam.id } }),
    onSuccess: () => {
      toast.success(typo("Экзамен удалён"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить экзамен"));
    },
  });

  return (
    <SimpleCard title={typo(`«${exam.title}» прошёл. Как всё прошло?`)}>
      <Text variant="small" color="supplementary">
        {typo(
          "Подготовка завершена. Можно сохранить знания надолго — карточки продолжат повторяться в спокойном ритме.",
        )}
      </Text>
      <HStack gap="sm" wrap>
        <Button
          variant="outline"
          size="sm"
          disabled={keepForever.isPending}
          onClick={() => {
            keepForever.mutate();
          }}
        >
          {typo("Сохранить надолго")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={archive.isPending}
          onClick={() => {
            archive.mutate();
          }}
        >
          {typo("В архив")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          {typo("Удалить")}
        </Button>
      </HStack>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить экзамен?")}
        description={typo("Вопросы, карточки и весь прогресс по ним будут удалены безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </SimpleCard>
  );
}

// Избранные чужие публичные экзамены (мигрированы из старых колод и добавленные на /d/…):
// отсюда их можно открыть по ссылке и забрать себе форком.
function FavoritesCard({ favorites }: { favorites: readonly FavoriteExamItem[] }) {
  const navigate = useNavigate();
  if (!favorites.length) return null;
  return (
    <SimpleCard title={typo("Избранное")}>
      <VStack gap="2xs">
        {favorites.map((favorite) => (
          <HStack key={favorite.examId} justify="between" align="center" gap="sm" wrap>
            <VStack gap="3xs">
              <Link to={`/d/${favorite.examId}`}>{typo(favorite.title)}</Link>
              <Text variant="mini" color="supplementary">
                {typo(
                  [
                    favorite.authorName ? `автор: ${favorite.authorName}` : "",
                    questionsCountLabel(favorite.totalQuestions),
                    cardsCountLabel(favorite.totalCards),
                  ]
                    .filter(Boolean)
                    .join(" · "),
                )}
              </Text>
            </VStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigate({ to: "/d/$examId", params: { examId: favorite.examId } });
              }}
            >
              {typo("Забрать себе")}
            </Button>
          </HStack>
        ))}
      </VStack>
    </SimpleCard>
  );
}

function OnboardingHero() {
  const navigate = useNavigate();
  return (
    <SimpleCard size="lg">
      <EmptyState
        illustration="cards"
        title={typo("Вставь вопросы — получи план подготовки")}
        text={typo(
          "ИИ ответит на каждый вопрос и соберёт атомарные карточки, а план распределит повторения назад от даты экзамена. Готовность считается по реальному припоминанию — без самообмана.",
        )}
      >
        <Button
          variant="brand"
          size="pill"
          onClick={() => {
            void navigate({ to: "/app/exams/new" });
          }}
        >
          {typo("Создать экзамен")}
        </Button>
      </EmptyState>
    </SimpleCard>
  );
}

function processingLine(exam: ExamListItem): string {
  if (exam.queuePosition) return typo(`в очереди: ${exam.queuePosition}`);
  return typo("генерируется прямо сейчас");
}

// Экзамены на паузе — одной тихой строкой: в план они не входят, но их легко вернуть.
function PausedExamsLine({ exams }: { exams: readonly ExamListItem[] }) {
  const queryClient = useQueryClient();
  const resume = useMutation({
    mutationFn: (examId: string) => setExamPaused({ data: { id: examId, paused: false } }),
    onSuccess: () => {
      toast.success(typo("Экзамен снова в плане"));
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
    },
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        toast.info(typo("Лимит активных экзаменов занят — сначала поставьте на паузу или заархивируйте другой"));
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось возобновить экзамен"));
    },
  });

  if (!exams.length) return null;
  return (
    <HStack gap="xs" align="center" wrap>
      <Text variant="mini" color="supplementary">
        {typo(`На паузе: ${exams.map((exam) => exam.title).join(", ")} ·`)}
      </Text>
      {exams.map((exam) => (
        <Button
          key={exam.id}
          variant="link"
          size="inline"
          className="font-semibold text-muted-foreground hover:text-primary"
          disabled={resume.isPending}
          onClick={() => {
            resume.mutate(exam.id);
          }}
        >
          {exams.length > 1 ? typo(`Возобновить «${exam.title}»`) : typo("Возобновить")}
        </Button>
      ))}
    </HStack>
  );
}

function TodayPage() {
  const navigate = useNavigate();
  const { data: exams } = useSuspenseQuery(examQueries.list());
  const { data: plan } = useSuspenseQuery(examQueries.todayPlan());
  const { data: favoriteExams } = useSuspenseQuery(examQueries.favorites());
  const [showCramPaywall, setShowCramPaywall] = useState(false);

  // Паузу считаем «не активен»: такие экзамены не попадают в карточки состояний
  // и показываются одной тихой строкой внизу.
  const activeExams = exams.filter((exam) => !exam.archivedAt && !exam.pausedAt);
  const pausedExams = exams.filter((exam) => !exam.archivedAt && exam.pausedAt);
  const processingExams = activeExams.filter((exam) => exam.status === "processing");
  const failedExams = activeExams.filter((exam) => exam.status === "failed");
  const passedExams = activeExams.filter((exam) => exam.daysToExam !== null && exam.daysToExam < 0);
  // Экзамен сегодня или завтра — предлагаем спокойный чек-лист дня экзамена.
  const examDayExams = activeExams.filter(
    (exam) => exam.daysToExam !== null && exam.daysToExam >= 0 && exam.daysToExam <= 1 && exam.totalCards > 0,
  );
  // Черновики без карточек — включая совсем пустые (без вопросов): такие остаются после сбоя
  // мастера, занимают лимит активных экзаменов и без этой карточки были бы невидимы.
  const draftExams = activeExams.filter(
    (exam) => exam.status !== "processing" && exam.status !== "failed" && !exam.totalCards,
  );

  const summaryByExam = new Map(plan.exams.map((summary) => [summary.examId, summary]));
  const blocks = plan.plan.flatMap((block) => {
    const summary = summaryByExam.get(block.examId);
    if (!summary || !block.cardIds.length) return [];
    return [{ block, summary }];
  });

  const planTarget = plan.cardsDoneToday + plan.planTotal;
  const estimatedMinutes = Math.max(Math.ceil(plan.planTotal / CARDS_PER_MINUTE), 1);
  const goSession = (examId: string, kind: "daily" | "pretest" | "bedtime" | "cram") => {
    void navigate({ to: "/app/exams/$examId/session", params: { examId }, search: { kind } });
  };

  // Сервер выбирает экзамен с сегодняшними ответами — именно из них строится предсонная очередь.
  const bedtimeExamId = plan.suggestions.bedtimeExamId;
  const cramSummaries = plan.exams.filter((summary) => plan.suggestions.cramExamIds.includes(summary.examId));
  const firstCram = cramSummaries[0];

  if (!exams.length) {
    return (
      <VStack gap="xl">
        <Heading variant="h1">{typo("Сегодня")}</Heading>
        <OnboardingHero />
        <FavoritesCard favorites={favoriteExams} />
      </VStack>
    );
  }

  const renderPlanSection = () => {
    const firstBlock = blocks[0];
    if (plan.planTotal > 0) {
      return (
        <VStack gap="md">
          <VStack gap="2xs">
            <Heading variant="h2" asParagraph>
              {typo("План на сегодня")}
            </Heading>
            {/* «осталось …» против «за сегодня …» ниже: два счётчика без пояснений читались как ошибка. */}
            <Text variant="small" color="supplementary">
              {typo(
                `осталось ${cardsCountLabel(plan.planTotal)} · около ${estimatedMinutes} ${pluralRu(estimatedMinutes, "минуты", "минут", "минут")}`,
              )}
            </Text>
          </VStack>
          <VStack gap="3xs">
            <SegmentedProgress total={planTarget} value={plan.cardsDoneToday} />
            {plan.cardsDoneToday > 0 && (
              <Text variant="mini" color="supplementary">
                {typo(
                  `за сегодня ${plan.cardsDoneToday} ${pluralRu(plan.cardsDoneToday, "ответ", "ответа", "ответов")} из ${planTarget}`,
                )}
              </Text>
            )}
          </VStack>
          <VStack gap="sm">
            {blocks.map(({ block, summary }, blockIndex) => (
              <PlanBlockCard
                key={block.examId}
                summary={summary}
                cardCount={block.cardIds.length}
                riseDelayMs={blockIndex * 70}
                onStart={() => {
                  goSession(block.examId, "daily");
                }}
              />
            ))}
          </VStack>
          {firstBlock && (
            <HStack>
              <Button
                variant="brand"
                size="pill"
                onClick={() => {
                  goSession(firstBlock.block.examId, "daily");
                }}
              >
                <Play className="size-5" strokeWidth={1.8} />
                {blocks.length > 1 ? typo("Пройти всё подряд") : typo("Начать сессию")}
              </Button>
            </HStack>
          )}
        </VStack>
      );
    }
    if (plan.cardsDoneToday > 0) {
      return (
        <SimpleCard size="lg" className="relative">
          <DayDoneConfetti />
          <EmptyState
            illustration="moon"
            title={typo(
              `День засчитан! Серия — ${plan.streakDays} ${pluralRu(plan.streakDays, "день", "дня", "дней")} 🔥`,
            )}
            text={typo("План на сегодня выполнен. Завтра карточки подъедут по расписанию — загляни снова.")}
          />
        </SimpleCard>
      );
    }
    return (
      <SimpleCard>
        <EmptyState
          illustration="calendar"
          title={typo("На сегодня карточек нет")}
          text={typo("Если генерация ещё идёт — карточки появятся здесь сами, как только будут готовы.")}
        />
      </SimpleCard>
    );
  };

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <Heading variant="h1">{typo("Сегодня")}</Heading>
        <Button
          variant="outline"
          onClick={() => {
            void navigate({ to: "/app/exams/new" });
          }}
        >
          <Plus className="size-4" />
          {typo("Новый экзамен")}
        </Button>
      </HStack>

      <TodayHero plan={plan} />

      {passedExams.map((exam) => (
        <ExamPassedCard key={exam.id} exam={exam} />
      ))}

      {examDayExams.map((exam) => (
        <SimpleCard key={exam.id}>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <CalendarCheck className="size-5" strokeWidth={1.8} />
              </span>
              <VStack gap="3xs">
                <Text bold>
                  {typo(exam.daysToExam === 0 ? `Сегодня экзамен «${exam.title}»` : `Завтра экзамен «${exam.title}»`)}
                </Text>
                <Text variant="mini" color="supplementary">
                  {typo("Открой план дня экзамена: короткое повторение, выгрузка тревог и советы перед аудиторией.")}
                </Text>
              </VStack>
            </HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigate({ to: "/app/exam-day/$examId", params: { examId: exam.id } });
              }}
            >
              {typo("План дня экзамена")}
            </Button>
          </HStack>
        </SimpleCard>
      ))}

      {processingExams.length > 0 && (
        <SimpleCard title={typo("Готовим карточки")}>
          <VStack gap="2xs">
            {processingExams.map((exam) => (
              <HStack key={exam.id} justify="between" align="center" gap="sm" wrap>
                <Link to={`/app/exams/${exam.id}`}>{typo(exam.title)}</Link>
                <Badge variant="muted">{processingLine(exam)}</Badge>
              </HStack>
            ))}
          </VStack>
          <Text variant="mini" color="supplementary">
            {typo("ИИ отвечает на вопросы и собирает карточки — обычно это занимает несколько минут.")}
          </Text>
        </SimpleCard>
      )}

      {failedExams.map((exam) => (
        <SimpleCard key={exam.id}>
          <HStack justify="between" align="center" gap="sm" wrap>
            <VStack gap="3xs">
              <Text bold>{typo(`Генерация «${exam.title}» не удалась`)}</Text>
              {exam.generationError && (
                <Text variant="mini" color="supplementary" breakWords>
                  {typo(exam.generationError)}
                </Text>
              )}
            </VStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigate({ to: "/app/exams/$examId", params: { examId: exam.id } });
              }}
            >
              {typo("Повторить")}
            </Button>
          </HStack>
        </SimpleCard>
      ))}

      {draftExams.map((exam) => (
        <SimpleCard key={exam.id}>
          <HStack justify="between" align="center" gap="sm" wrap>
            <VStack gap="3xs">
              <Text bold>{typo(exam.title)}</Text>
              <Text variant="mini" color="supplementary">
                {typo(
                  exam.totalQuestions > 0
                    ? "Вопросы добавлены, карточек ещё нет — запусти генерацию на странице экзамена."
                    : "Пустой черновик занимает лимит активных экзаменов — добавь вопросы на странице экзамена или удали его.",
                )}
              </Text>
            </VStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigate({ to: "/app/exams/$examId", params: { examId: exam.id } });
              }}
            >
              {typo("Открыть")}
            </Button>
          </HStack>
        </SimpleCard>
      ))}

      {renderPlanSection()}

      {plan.suggestions.bedtime && bedtimeExamId && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Moon className="size-5" strokeWidth={1.8} />
              </span>
              <VStack gap="3xs">
                <Text bold>{typo("Лёгкое повторение перед сном")}</Text>
                <Text variant="mini" color="supplementary">
                  {typo("Около 5 минут по пройденному за день — сон закрепит материал.")}
                </Text>
              </VStack>
            </HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                goSession(bedtimeExamId, "bedtime");
              }}
            >
              {typo("Начать")}
            </Button>
          </HStack>
        </SimpleCard>
      )}

      {firstCram && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                <Zap className="size-5" strokeWidth={1.8} />
              </span>
              <VStack gap="3xs">
                <HStack gap="xs" align="center">
                  <Text bold>{typo(`Скоро экзамен «${firstCram.title}»? Включи умную зубрёжку`)}</Text>
                  <Badge variant="primary">Pro</Badge>
                </HStack>
                <Text variant="mini" color="supplementary">
                  {typo("Спринты по самым слабым карточкам с повтором ошибок и защитой сна.")}
                </Text>
              </VStack>
            </HStack>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (plan.suggestions.pro) {
                  goSession(firstCram.examId, "cram");
                  return;
                }
                setShowCramPaywall(true);
              }}
            >
              {typo("Включить")}
            </Button>
          </HStack>
          {showCramPaywall && (
            <PaywallCard
              reason="CRAM"
              compact
              onShown={() => {
                void logEvent({ data: { name: "paywall_shown", meta: { reason: "CRAM", place: "today" } } }).catch(
                  () => undefined,
                );
              }}
            />
          )}
        </SimpleCard>
      )}

      <FavoritesCard favorites={favoriteExams} />

      <PausedExamsLine exams={pausedExams} />

      {activeExams.some((exam) => exam.examDate && exam.daysToExam !== null && exam.daysToExam >= 0) && (
        <Text variant="mini" color="supplementary">
          {typo(
            activeExams
              .filter((exam) => exam.examDate && exam.daysToExam !== null && exam.daysToExam >= 0)
              .map((exam) => `${exam.title} — ${formatDateRuMsk(new Date(exam.examDate ?? 0))}`)
              .join(" · "),
          )}
        </Text>
      )}
    </VStack>
  );
}
