import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdaptiveGrid, Badge, Button, Heading, HStack, Input, Link, PaywallCard, SimpleCard, Stat, Text, VStack } from "~/components";
import { formatDateRuMsk, isPaywallError, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";
import { createExamsDraft } from "~/server/fn/exams";
import { updateUserSettings } from "~/server/fn/settings";

import { dashboardQueries, type ExamListItem } from "./_lib/model/dashboardQueries";

// Временный дашборд волны 1: список экзаменов + план дня. Полноценный экран «Сегодня»
// с кольцами готовности и мастером создания появится в волне 3.

export const Route = createFileRoute("/app/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQueries.exams()),
      context.queryClient.ensureQueryData(dashboardQueries.todayPlan()),
      context.queryClient.ensureQueryData(dashboardQueries.settings()),
    ]),
  head: () => ({ meta: [{ title: typo("Экзамены") }] }),
  component: DashboardPage,
});

function statusBadge(exam: ExamListItem) {
  if (exam.status === "processing") {
    const queueLabel = exam.queuePosition ? typo(`в очереди: ${exam.queuePosition}`) : typo("генерируется…");
    return <Badge variant="muted">{queueLabel}</Badge>;
  }
  if (exam.status === "failed") return <Badge variant="outline">{typo("ошибка генерации")}</Badge>;
  if (exam.status === "draft") return <Badge variant="muted">{typo("черновик")}</Badge>;
  return null;
}

function examDateLine(exam: ExamListItem): string {
  if (!exam.examDate) return typo("без даты — поддерживающее повторение");
  if (exam.daysToExam !== null && exam.daysToExam >= 0) {
    return typo(`${formatDateRuMsk(new Date(exam.examDate))} · осталось дней: ${exam.daysToExam}`);
  }
  return typo(`${formatDateRuMsk(new Date(exam.examDate))} · экзамен прошёл`);
}

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exams } = useSuspenseQuery(dashboardQueries.exams());
  const { data: plan } = useSuspenseQuery(dashboardQueries.todayPlan());
  const { data: settings } = useSuspenseQuery(dashboardQueries.settings());

  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [showMultiExamPaywall, setShowMultiExamPaywall] = useState(false);
  const [minutes, setMinutes] = useState(String(settings.dailyMinutesTotal));

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
  };

  const createExam = useMutation({
    mutationFn: () => createExamsDraft({ data: { exams: [{ title: title.trim(), examDate: examDate || null }] } }),
    onSuccess: (created) => {
      setTitle("");
      setExamDate("");
      invalidateAll();
      const first = created[0];
      if (first) void navigate({ to: "/app/exams/$examId", params: { examId: first.id } });
    },
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        setShowMultiExamPaywall(true);
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось создать экзамен"));
    },
  });

  const saveMinutes = useMutation({
    mutationFn: () => updateUserSettings({ data: { dailyMinutesTotal: Number(minutes) } }),
    onSuccess: () => {
      toast.success(typo("Сохранили дневной бюджет"));
      invalidateAll();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить настройки"));
    },
  });

  const planByExam = new Map(plan.plan.map((block) => [block.examId, block.cardIds.length]));

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <Heading variant="h1">{typo("Мои экзамены")}</Heading>
      </HStack>

      <SimpleCard title={typo("Сегодня")}>
        <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
          <Stat label={typo("Серия")} value={plan.streakDays} hint={typo(`заморозок: ${plan.freezesLeft}`)} />
          <Stat label={typo("План на сегодня")} value={plan.planTotal} hint={typo("карточек")} />
          <Stat label={typo("Сделано сегодня")} value={plan.cardsDoneToday} />
          <Stat label={typo("Минут в день")} value={plan.dailyMinutesTotal} />
        </AdaptiveGrid>
        {plan.suggestions.bedtime && (
          <Text variant="small" color="supplementary">
            {typo("Вечер — самое время для лёгкого предсонного повторения: откройте экзамен и выберите режим «перед сном».")}
          </Text>
        )}
        {plan.suggestions.cramExamIds.length > 0 && (
          <Text variant="small" color="supplementary">
            {typo("До экзамена меньше двух дней — доступна умная зубрёжка (Pro) на странице экзамена.")}
          </Text>
        )}
        <HStack gap="sm" align="center" wrap>
          <Input
            value={minutes}
            type="number"
            className="w-24"
            aria-label={typo("Минут в день")}
            onChange={(event) => {
              setMinutes(event.target.value);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={saveMinutes.isPending || !Number(minutes)}
            onClick={() => {
              saveMinutes.mutate();
            }}
          >
            {typo("Сохранить минуты в день")}
          </Button>
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Новый экзамен")}>
        <Text variant="small" color="supplementary">
          {typo(
            "Пока это черновик: название и дата. Мастер с вопросами, материалами и ИИ-генерацией карточек — в следующей волне.",
          )}
        </Text>
        <HStack gap="sm" align="center" wrap>
          <Input
            value={title}
            placeholder={typo("Название экзамена")}
            className="max-w-xs"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <Input
            value={examDate}
            type="date"
            className="w-44"
            aria-label={typo("Дата экзамена")}
            onChange={(event) => {
              setExamDate(event.target.value);
            }}
          />
          <Button
            disabled={createExam.isPending || !title.trim()}
            onClick={() => {
              createExam.mutate();
            }}
          >
            {typo("Создать")}
          </Button>
        </HStack>
        {showMultiExamPaywall && (
          <PaywallCard
            reason="MULTI_EXAM"
            compact
            onShown={() => {
              void logEvent({ data: { name: "paywall_shown", meta: { reason: "MULTI_EXAM" } } }).catch(() => undefined);
            }}
          />
        )}
      </SimpleCard>

      {exams.length ? (
        <VStack gap="md">
          {exams.map((exam) => (
            <SimpleCard key={exam.id}>
              <HStack justify="between" align="center" gap="md" wrap>
                <VStack gap="3xs">
                  <HStack gap="xs" align="center" wrap>
                    <Link to={`/app/exams/${exam.id}`} className="font-semibold">
                      {typo(exam.title)}
                    </Link>
                    {statusBadge(exam)}
                    {exam.archivedAt && <Badge variant="outline">{typo("в архиве")}</Badge>}
                  </HStack>
                  <Text variant="small" color="supplementary">
                    {examDateLine(exam)}
                  </Text>
                  <Text variant="small" color="supplementary">
                    {typo(`Карточек: ${exam.totalCards} · сегодня в плане: ${planByExam.get(exam.id) ?? 0}`)}
                  </Text>
                </VStack>
                <VStack gap="3xs" className="items-end">
                  <Heading variant="h3" asParagraph>
                    {`${Math.round(exam.readiness * 100)}%`}
                  </Heading>
                  <Text variant="mini" color="supplementary">
                    {typo("готовность")}
                  </Text>
                </VStack>
              </HStack>
            </SimpleCard>
          ))}
        </VStack>
      ) : (
        <SimpleCard title={typo("Создайте первый экзамен")} size="lg">
          <Text color="supplementary">
            {typo(
              "Добавьте экзамен с датой — приложение спланирует повторения назад от неё и покажет честную готовность.",
            )}
          </Text>
        </SimpleCard>
      )}

      <Text variant="mini" color="supplementary">
        {typo("Временный экран волны 1. Мастер создания экзаменов с вопросами и полноценные сессии — в следующей волне.")}
      </Text>
    </VStack>
  );
}
