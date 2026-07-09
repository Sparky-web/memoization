import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Flame, Moon, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, ConfirmDialog, Heading, HStack, Link, PaywallCard, ProgressBar, ReadinessRing, SimpleCard, Text, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";
import { archiveExam, deleteExam, updateExam } from "~/server/fn/exams";

import { cardsCountLabel, daysToExamLabel, type ExamListItem, examQueries, pluralRu, type TodayPlan } from "./exams/_lib";

// «Сегодня» — главный экран: серия, план дня по экзаменам, предложения режимов
// и карточки состояний (генерация, ошибка, прошедший экзамен).

export const Route = createFileRoute("/app/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(examQueries.list()),
      context.queryClient.ensureQueryData(examQueries.todayPlan()),
    ]),
  head: () => ({ meta: [{ title: typo("Сегодня") }] }),
  component: TodayPage,
});

// Скорость из планировщика: ~2 карточки в минуту — для оценки «~N минут».
const CARDS_PER_MINUTE = 2;

function StreakLine({ plan }: { plan: TodayPlan }) {
  const restNote = plan.restWeekdays.length
    ? typo(` · дней отдыха в неделю: ${plan.restWeekdays.length}`)
    : "";
  return (
    <HStack gap="sm" align="center" wrap>
      <HStack gap="2xs" align="center" className="rounded-full bg-card px-3 py-1">
        <Flame className="size-4 text-warning" />
        <Text variant="small" bold>
          {typo(`${plan.streakDays} ${pluralRu(plan.streakDays, "день", "дня", "дней")}`)}
        </Text>
      </HStack>
      <Text variant="mini" color="supplementary">
        {typo(`заморозок: ${plan.freezesLeft}`) + restNote}
      </Text>
    </HStack>
  );
}

// Блок плана по одному экзамену: готовность, счётчик и запуск сессии.
function PlanBlockRow({
  summary,
  cardCount,
  onStart,
}: {
  summary: TodayPlan["exams"][number];
  cardCount: number;
  onStart: () => void;
}) {
  const daysLabel = daysToExamLabel(summary.daysToExam);
  return (
    <HStack justify="between" align="center" gap="md" className="rounded-2xl bg-card p-4" wrap>
      <HStack gap="md" align="center">
        <ReadinessRing value={summary.readiness} size="sm" />
        <VStack gap="3xs">
          <Link to={`/app/exams/${summary.examId}`} className="font-semibold">
            {typo(summary.title)}
          </Link>
          <Text variant="mini" color="supplementary">
            {[daysLabel, cardsCountLabel(cardCount)].filter(Boolean).join(" · ")}
          </Text>
        </VStack>
      </HStack>
      <Button variant="outline" size="sm" onClick={onStart}>
        {typo("Начать")}
      </Button>
    </HStack>
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
        {typo("Подготовка завершена. Можно сохранить знания надолго — карточки продолжат повторяться в спокойном ритме.")}
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

function OnboardingHero() {
  const navigate = useNavigate();
  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <Heading variant="h2" asParagraph>
          {typo("Вставь вопросы — получи план подготовки")}
        </Heading>
        <Text color="supplementary">
          {typo(
            "Добавь список вопросов и дату экзамена: ИИ ответит на каждый вопрос, соберёт атомарные карточки, а план распределит повторения назад от даты. Готовность считается по реальному припоминанию — без самообмана.",
          )}
        </Text>
        <HStack>
          <Button
            size="pill"
            onClick={() => {
              void navigate({ to: "/app/exams/new" });
            }}
          >
            {typo("Создать экзамен")}
          </Button>
        </HStack>
      </VStack>
    </SimpleCard>
  );
}

function processingLine(exam: ExamListItem): string {
  if (exam.queuePosition) return typo(`в очереди: ${exam.queuePosition}`);
  return typo("генерируется прямо сейчас");
}

function TodayPage() {
  const navigate = useNavigate();
  const { data: exams } = useSuspenseQuery(examQueries.list());
  const { data: plan } = useSuspenseQuery(examQueries.todayPlan());
  const [showCramPaywall, setShowCramPaywall] = useState(false);

  const activeExams = exams.filter((exam) => !exam.archivedAt);
  const processingExams = activeExams.filter((exam) => exam.status === "processing");
  const failedExams = activeExams.filter((exam) => exam.status === "failed");
  const passedExams = activeExams.filter((exam) => exam.daysToExam !== null && exam.daysToExam < 0);
  const draftExams = activeExams.filter(
    (exam) => exam.status !== "processing" && exam.status !== "failed" && !exam.totalCards && exam.totalQuestions > 0,
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

  const bedtimeExamId = plan.plan[0]?.examId ?? plan.exams[0]?.examId;
  const cramSummaries = plan.exams.filter((summary) => plan.suggestions.cramExamIds.includes(summary.examId));
  const firstCram = cramSummaries[0];

  if (!exams.length) {
    return (
      <VStack gap="xl">
        <Heading variant="h1">{typo("Сегодня")}</Heading>
        <OnboardingHero />
      </VStack>
    );
  }

  const renderPlanBody = () => {
    const firstBlock = blocks[0];
    if (plan.planTotal > 0) {
      return (
        <VStack gap="md">
          <VStack gap="2xs">
            <Text variant="small" color="supplementary">
              {typo(`${cardsCountLabel(plan.planTotal)} · около ${estimatedMinutes} ${pluralRu(estimatedMinutes, "минуты", "минут", "минут")}`)}
            </Text>
            {plan.cardsDoneToday > 0 && (
              <VStack gap="3xs">
                <ProgressBar value={planTarget ? plan.cardsDoneToday / planTarget : 0} tone="success" />
                <Text variant="mini" color="supplementary">
                  {typo(`сделано ${plan.cardsDoneToday} из ${planTarget}`)}
                </Text>
              </VStack>
            )}
          </VStack>
          <VStack gap="sm">
            {blocks.map(({ block, summary }) => (
              <PlanBlockRow
                key={block.examId}
                summary={summary}
                cardCount={block.cardIds.length}
                onStart={() => {
                  goSession(block.examId, "daily");
                }}
              />
            ))}
          </VStack>
          {firstBlock && (
            <HStack>
              <Button
                size="pill"
                onClick={() => {
                  goSession(firstBlock.block.examId, "daily");
                }}
              >
                {blocks.length > 1 ? typo("Пройти всё подряд") : typo("Начать сессию")}
              </Button>
            </HStack>
          )}
        </VStack>
      );
    }
    if (plan.cardsDoneToday > 0) {
      return (
        <VStack gap="sm">
          <Heading variant="h3" asParagraph>
            {typo(`День засчитан 🔥 Серия: ${plan.streakDays} ${pluralRu(plan.streakDays, "день", "дня", "дней")}`)}
          </Heading>
          <Text variant="small" color="supplementary">
            {typo("План на сегодня выполнен. Завтра карточки подъедут по расписанию — загляни снова.")}
          </Text>
        </VStack>
      );
    }
    return (
      <Text variant="small" color="supplementary">
        {typo("На сегодня карточек нет: если генерация ещё идёт — они появятся здесь, как только будут готовы.")}
      </Text>
    );
  };

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <VStack gap="2xs">
          <Heading variant="h1">{typo("Сегодня")}</Heading>
          <StreakLine plan={plan} />
        </VStack>
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

      {passedExams.map((exam) => (
        <ExamPassedCard key={exam.id} exam={exam} />
      ))}

      {processingExams.length > 0 && (
        <SimpleCard title={typo("Готовим карточки")}>
          <VStack gap="2xs">
            {processingExams.map((exam) => (
              <HStack key={exam.id} justify="between" align="center" gap="sm" wrap>
                <Link to={`/app/exams/${exam.id}`}>
                  {typo(exam.title)}
                </Link>
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
                {typo("Вопросы добавлены, карточек ещё нет — запусти генерацию на странице экзамена.")}
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

      <SimpleCard title={typo("План на сегодня")} size="lg">
        {renderPlanBody()}
      </SimpleCard>

      {plan.suggestions.bedtime && bedtimeExamId && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <HStack gap="sm" align="center">
              <Moon className="size-5 text-muted-foreground" />
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
              <Zap className="size-5 text-warning" />
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
                void logEvent({ data: { name: "paywall_shown", meta: { reason: "CRAM", place: "today" } } }).catch(() => undefined);
              }}
            />
          )}
        </SimpleCard>
      )}

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
