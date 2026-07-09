import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Badge, Button, Heading, HStack, Link, ReadinessRing, SimpleCard, Text, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";

import { cardsCountLabel, daysToExamLabel, type ExamListItem, examQueries, questionsCountLabel } from "./_lib";

// Список всех экзаменов, включая архив. Оперативный экран — «Сегодня»; здесь навигация и обзор.

export const Route = createFileRoute("/app/exams/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(examQueries.list()),
  head: () => ({ meta: [{ title: typo("Экзамены") }] }),
  component: ExamsListPage,
});

function statusBadge(exam: ExamListItem) {
  if (exam.status === "processing") {
    return <Badge variant="muted">{exam.queuePosition ? typo(`в очереди: ${exam.queuePosition}`) : typo("генерируется…")}</Badge>;
  }
  if (exam.status === "failed") return <Badge className="bg-destructive/15 text-destructive">{typo("ошибка генерации")}</Badge>;
  if (exam.status === "draft") return <Badge variant="muted">{typo("черновик")}</Badge>;
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

function ExamRow({ exam }: { exam: ExamListItem }) {
  return (
    <SimpleCard>
      <HStack justify="between" align="center" gap="md" wrap>
        <HStack gap="md" align="center">
          <ReadinessRing value={exam.readiness} size="sm" />
          <VStack gap="3xs">
            <HStack gap="xs" align="center" wrap>
              <Link to={`/app/exams/${exam.id}`} className="font-semibold">
                {typo(exam.title)}
              </Link>
              {statusBadge(exam)}
              {exam.isPublic && <Badge variant="outline">{typo("по ссылке")}</Badge>}
            </HStack>
            <Text variant="mini" color="supplementary">
              {examMetaLine(exam)}
            </Text>
          </VStack>
        </HStack>
      </HStack>
    </SimpleCard>
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
          {activeExams.map((exam) => (
            <ExamRow key={exam.id} exam={exam} />
          ))}
        </VStack>
      ) : (
        <SimpleCard>
          <Text color="supplementary">
            {typo("Активных экзаменов нет. Создай первый — вставь список вопросов и получи план подготовки.")}
          </Text>
        </SimpleCard>
      )}

      {archivedExams.length > 0 && (
        <VStack gap="sm">
          <Heading variant="h3" asParagraph>
            {typo("Архив")}
          </Heading>
          {archivedExams.map((exam) => (
            <ExamRow key={exam.id} exam={exam} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}
