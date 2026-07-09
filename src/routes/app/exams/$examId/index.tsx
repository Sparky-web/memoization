import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdaptiveGrid, Badge, Button, Heading, HStack, PaywallCard, ReadinessRing, SimpleCard, Stat, Text, VStack } from "~/components";
import { formatDateRuMsk, isPaywallError, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";

import { daysToExamLabel, type ExamDetail, examQueries, generateExam, type SessionKind, updateExam } from "../_lib";
import { CardsSection } from "./_lib/components/CardsSection";
import { MaterialsSection } from "./_lib/components/MaterialsSection";
import { QuestionsSection } from "./_lib/components/QuestionsSection";
import { SettingsSection } from "./_lib/components/SettingsSection";
import { TopicsSection } from "./_lib/components/TopicsSection";

// Хаб экзамена: готовность, режим подготовки, темы, вопросы, библиотека карточек,
// материалы и настройки. Статусы генерации поллятся, пока экзамен в processing.

export const Route = createFileRoute("/app/exams/$examId/")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(examQueries.detail(params.examId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: typo("Экзамен") }] }),
  notFoundComponent: () => (
    <VStack gap="md">
      <Heading variant="h1">{typo("Экзамен не найден")}</Heading>
      <Text color="supplementary">{typo("Ссылка неверна или экзамен удалён.")}</Text>
    </VStack>
  ),
  component: ExamHubPage,
});

type HubTab = "topics" | "questions" | "cards" | "materials" | "settings";

const HUB_TABS: readonly { value: HubTab; label: string }[] = [
  { value: "topics", label: typo("Темы") },
  { value: "questions", label: typo("Вопросы") },
  { value: "cards", label: typo("Карточки") },
  { value: "materials", label: typo("Материалы") },
  { value: "settings", label: typo("Настройки") },
];

function examDateLine(exam: ExamDetail): string {
  if (!exam.examDate) return typo("Без даты — поддерживающее повторение");
  const daysLabel = daysToExamLabel(exam.daysToExam);
  return typo(formatDateRuMsk(new Date(exam.examDate))) + (daysLabel ? typo(` · ${daysLabel}`) : "");
}

// Баннер статуса генерации: очередь при processing, ошибка и повтор при failed.
function GenerationStatusBanner({ exam }: { exam: ExamDetail }) {
  const queryClient = useQueryClient();
  const [showPaywall, setShowPaywall] = useState(false);

  const generate = useMutation({
    mutationFn: () => generateExam({ data: { examId: exam.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      if (isPaywallError(error, "GENERATION")) {
        setShowPaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось запустить генерацию");
      toast.error(humanMessage);
    },
  });

  if (exam.status === "processing") {
    const line = exam.queuePosition
      ? typo(`В очереди на генерацию: ${exam.queuePosition}. Страница обновится сама.`)
      : typo("ИИ отвечает на вопросы и собирает карточки — страница обновится сама.");
    return (
      <SimpleCard>
        <HStack gap="sm" align="center">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
          <Text variant="small" color="supplementary">
            {line}
          </Text>
        </HStack>
      </SimpleCard>
    );
  }

  if (exam.status === "failed") {
    return (
      <SimpleCard className="border border-destructive/25">
        <VStack gap="sm">
          <Text bold>{typo("Генерация не удалась")}</Text>
          {exam.generationError && (
            <Text variant="small" color="supplementary" breakWords>
              {typo(exam.generationError)}
            </Text>
          )}
          <HStack>
            <Button
              variant="outline"
              size="sm"
              disabled={generate.isPending}
              onClick={() => {
                generate.mutate();
              }}
            >
              {typo("Повторить генерацию")}
            </Button>
          </HStack>
          {showPaywall && <PaywallCard reason="GENERATION" compact />}
        </VStack>
      </SimpleCard>
    );
  }

  // Черновик с вопросами, но без карточек — предлагаем запустить генерацию.
  if (!exam.counters.totalCards && exam.questions.length) {
    return (
      <SimpleCard>
        <VStack gap="sm">
          <Text variant="small" color="supplementary">
            {typo("Вопросы добавлены. ИИ ответит на каждый (по материалам — с цитатой источника) и соберёт атомарные карточки.")}
          </Text>
          <HStack>
            <Button
              disabled={generate.isPending}
              onClick={() => {
                generate.mutate();
              }}
            >
              {typo("Сгенерировать ответы и карточки")}
            </Button>
          </HStack>
          {showPaywall && (
            <PaywallCard
              reason="GENERATION"
              compact
              onShown={() => {
                void logEvent({ data: { name: "paywall_shown", meta: { reason: "GENERATION", place: "exam_hub" } } }).catch(
                  () => undefined,
                );
              }}
            />
          )}
        </VStack>
      </SimpleCard>
    );
  }

  return null;
}

function ExamHubPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));

  const [tab, setTab] = useState<HubTab>(() => (exam.topics.length ? "topics" : "questions"));
  const [showCramPaywall, setShowCramPaywall] = useState(false);

  const setMode = useMutation({
    mutationFn: (mode: "long" | "cram") => updateExam({ data: { id: examId, data: { mode } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      if (isPaywallError(error, "CRAM")) {
        setShowCramPaywall(true);
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось сменить режим"));
    },
  });

  const goSession = (kind: SessionKind) => {
    void navigate({ to: "/app/exams/$examId/session", params: { examId }, search: { kind } });
  };
  const mainSessionKind: SessionKind = exam.mode === "cram" ? "cram" : "daily";
  const hasActiveCards = exam.counters.totalCards - exam.counters.suspended > 0;

  const renderTabContent = () => {
    if (tab === "topics") {
      return (
        <TopicsSection
          exam={exam}
          onPretest={() => {
            goSession("pretest");
          }}
        />
      );
    }
    if (tab === "questions") return <QuestionsSection exam={exam} />;
    if (tab === "cards") return <CardsSection examId={examId} />;
    if (tab === "materials") return <MaterialsSection exam={exam} />;
    return <SettingsSection exam={exam} />;
  };

  return (
    <VStack gap="lg">
      <VStack gap="sm">
        <HStack justify="between" align="start" gap="md" wrap>
          <VStack gap="2xs">
            <Heading variant="h1" breakWords>
              {typo(exam.title)}
            </Heading>
            <HStack gap="xs" align="center" wrap>
              {exam.archivedAt && <Badge variant="outline">{typo("в архиве")}</Badge>}
              {exam.isPublic && <Badge variant="outline">{typo("по ссылке")}</Badge>}
              <Text variant="small" color="supplementary">
                {examDateLine(exam)}
              </Text>
            </HStack>
          </VStack>
          <ReadinessRing value={exam.readiness} size="lg" />
        </HStack>

        <HStack gap="2xs" align="center" wrap>
          <Button
            variant={exam.mode === "long" ? "secondary" : "outline"}
            size="sm"
            disabled={setMode.isPending}
            onClick={() => {
              setMode.mutate("long");
            }}
          >
            {typo("Долгая подготовка")}
          </Button>
          <Button
            variant={exam.mode === "cram" ? "secondary" : "outline"}
            size="sm"
            disabled={setMode.isPending}
            onClick={() => {
              setMode.mutate("cram");
            }}
          >
            {typo("Умная зубрёжка")}
            <Badge variant="primary">Pro</Badge>
          </Button>
        </HStack>
        {showCramPaywall && (
          <PaywallCard
            reason="CRAM"
            compact
            onShown={() => {
              void logEvent({ data: { name: "paywall_shown", meta: { reason: "CRAM", place: "exam_hub" } } }).catch(() => undefined);
            }}
          />
        )}

        {hasActiveCards && !exam.archivedAt && (
          <HStack gap="sm" wrap>
            <Button
              onClick={() => {
                goSession(mainSessionKind);
              }}
            >
              <Play className="size-4" />
              {exam.mode === "cram" ? typo("Начать зубрёжку") : typo("Начать сессию")}
            </Button>
          </HStack>
        )}
      </VStack>

      <GenerationStatusBanner exam={exam} />

      {hasActiveCards && (
        <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
          <Stat label={typo("Карточек")} value={exam.counters.totalCards} />
          <Stat label={typo("К повторению")} value={exam.counters.due} />
          <Stat label={typo("Новых")} value={exam.counters.new} />
          <Stat label={typo("Помечено")} value={exam.counters.flagged} hint={typo(`выключено: ${exam.counters.suspended}`)} />
        </AdaptiveGrid>
      )}

      <HStack gap="2xs" wrap>
        {HUB_TABS.map((option) => (
          <Button
            key={option.value}
            variant={tab === option.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setTab(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </HStack>

      {renderTabContent()}
    </VStack>
  );
}
