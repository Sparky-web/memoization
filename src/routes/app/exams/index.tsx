import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";

import { Badge, Button, EmptyState, Heading, HStack, Link, ReadinessRing, SimpleCard, Text, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";

import { cardsCountLabel, daysToExamLabel, type ExamListItem, examQueries, questionsCountLabel } from "./_lib";

// Список всех экзаменов, включая архив. Оперативный экран — «Сегодня»; здесь навигация и обзор.

export const Route = createFileRoute("/app/exams/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(examQueries.list()),
  head: () => ({ meta: [{ title: typo("Экзамены") }] }),
  component: ExamsListPage,
});

// Статусы — «цветная точка + тихий текст», без залитых пилюль.
function statusBadge(exam: ExamListItem) {
  if (exam.status === "processing") {
    return (
      <Badge variant="dot" dot="primary">
        {exam.queuePosition ? typo(`в очереди: ${exam.queuePosition}`) : typo("генерируется…")}
      </Badge>
    );
  }
  if (exam.status === "failed") {
    return (
      <Badge variant="dot" dot="destructive">
        {typo("ошибка генерации")}
      </Badge>
    );
  }
  if (exam.status === "draft") {
    return (
      <Badge variant="dot" dot="muted">
        {typo("черновик")}
      </Badge>
    );
  }
  return null;
}

function examMetaLine(exam: ExamListItem): string {
  const parts: string[] = [];
  if (exam.examDate) {
    const daysLabel = daysToExamLabel(exam.daysToExam);
    parts.push(typo(formatDateRuMsk(new Date(exam.examDate))) + (daysLabel ? typo(` (${daysLabel})`) : ""));
  } else {
    parts.push(typo("без даты — поддерживающее повторение"));
  }
  parts.push(questionsCountLabel(exam.totalQuestions));
  parts.push(cardsCountLabel(exam.totalCards));
  return parts.join(" · ");
}

// Строка экзамена: вся карточка — ссылка на хаб, с подъёмом на hover.
function ExamRow({ exam, riseDelayMs }: { exam: ExamListItem; riseDelayMs: number }) {
  return (
    <Link
      to={`/app/exams/${exam.id}`}
      className="rise block w-full"
      style={{ animationDelay: `${riseDelayMs}ms` }}
    >
      <SimpleCard interactive>
        <HStack justify="between" align="center" gap="md">
          <HStack gap="md" align="center" className="min-w-0">
            <ReadinessRing value={exam.readiness} size="sm" />
            <VStack gap="3xs" className="min-w-0">
              <HStack gap="xs" align="center" wrap>
                <Text bold breakWords>
                  {typo(exam.title)}
                </Text>
                {statusBadge(exam)}
                {exam.isPublic && (
                  <Badge variant="dot" dot="success">
                    {typo("по ссылке")}
                  </Badge>
                )}
              </HStack>
              <Text variant="mini" color="supplementary">
                {examMetaLine(exam)}
              </Text>
            </VStack>
          </HStack>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        </HStack>
      </SimpleCard>
    </Link>
  );
}

function ExamsListPage() {
  const navigate = useNavigate();
  const { data: exams } = useSuspenseQuery(examQueries.list());

  const activeExams = exams.filter((exam) => !exam.archivedAt);
  const archivedExams = exams.filter((exam) => exam.archivedAt);

  return (
    <VStack gap="xl">
      <HStack justify="between" align="center" gap="md" wrap>
        <Heading variant="h1">{typo("Экзамены")}</Heading>
        <Button
          onClick={() => {
            void navigate({ to: "/app/exams/new" });
          }}
        >
          <Plus className="size-4" />
          {typo("Новый экзамен")}
        </Button>
      </HStack>

      {activeExams.length ? (
        <VStack gap="sm">
          {activeExams.map((exam, examIndex) => (
            <ExamRow key={exam.id} exam={exam} riseDelayMs={Math.min(examIndex, 8) * 60} />
          ))}
        </VStack>
      ) : (
        <SimpleCard>
          <EmptyState
            illustration="cards"
            title={typo("Активных экзаменов нет")}
            text={typo("Создай первый: вставь список вопросов — и получи план подготовки с карточками.")}
          >
            <Button
              variant="brand"
              size="pill"
              onClick={() => {
                void navigate({ to: "/app/exams/new" });
              }}
            >
              <Plus className="size-5" strokeWidth={1.8} />
              {typo("Создать экзамен")}
            </Button>
          </EmptyState>
        </SimpleCard>
      )}

      {archivedExams.length > 0 && (
        <VStack gap="sm">
          <Heading variant="h3" asParagraph>
            {typo("Архив")}
          </Heading>
          {archivedExams.map((exam, examIndex) => (
            <ExamRow key={exam.id} exam={exam} riseDelayMs={Math.min(examIndex, 8) * 60} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}
