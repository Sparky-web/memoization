import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Container, Heading, HStack, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { isPaywallError, typo } from "~/lib";
import { forkExam, getPublicExam } from "~/server/fn/exams";

// Временное публичное превью экзамена: вопросы + «Забрать себе» (форк со своей датой и прогрессом).

const publicExamQuery = (examId: string) =>
  queryOptions({
    queryKey: ["public-exam", examId],
    queryFn: () => getPublicExam({ data: { id: examId } }),
  });

function ogDescription(exam: { description: string | null; totalQuestions: number; totalCards: number } | undefined): string {
  if (!exam) return typo("Карточки и вопросы для подготовки к экзамену");
  if (exam.description) return typo(exam.description);
  return typo(`${exam.totalQuestions} вопросов и ${exam.totalCards} карточек для подготовки к экзамену`);
}

export const Route = createFileRoute("/d/$examId/")({
  // Экзамен приватный/удалён/ссылка неверна → server fn кидает 404; показываем заглушку, а не 500.
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(publicExamQuery(params.examId));
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => {
    const title = loaderData ? typo(loaderData.title) : typo("Экзамен");
    return {
      meta: [
        { title },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: ogDescription(loaderData) },
        { property: "og:site_name", content: typo("Мемокарты") },
        { property: "og:type", content: "website" },
      ],
    };
  },
  notFoundComponent: PublicExamNotFound,
  component: PublicExamPage,
});

function PublicExamNotFound() {
  const navigate = useNavigate();
  return (
    <main className="min-h-dvh overflow-y-auto">
      <Container className="py-8">
        <VStack gap="md">
          <Heading variant="h1">{typo("Экзамен недоступен")}</Heading>
          <Text color="supplementary">{typo("Ссылка неверна или владелец закрыл доступ по ссылке.")}</Text>
          <HStack>
            <Button
              onClick={() => {
                void navigate({ to: "/" });
              }}
            >
              {typo("На главную")}
            </Button>
          </HStack>
        </VStack>
      </Container>
    </main>
  );
}

function PublicExamPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const { data: exam } = useSuspenseQuery(publicExamQuery(examId));
  const [showMultiExamPaywall, setShowMultiExamPaywall] = useState(false);

  const fork = useMutation({
    mutationFn: () => forkExam({ data: { id: examId, examDate: null } }),
    onSuccess: (created) => {
      toast.success(typo("Экзамен скопирован — назначьте свою дату"));
      void navigate({ to: "/app/exams/$examId", params: { examId: created.id } });
    },
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        setShowMultiExamPaywall(true);
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось скопировать экзамен"));
    },
  });

  const renderAction = () => {
    if (exam.isOwner) {
      return (
        <Button
          onClick={() => {
            void navigate({ to: "/app/exams/$examId", params: { examId } });
          }}
        >
          {typo("Открыть экзамен")}
        </Button>
      );
    }
    if (exam.isAuthenticated) {
      return (
        <Button
          disabled={fork.isPending}
          onClick={() => {
            fork.mutate();
          }}
        >
          {typo("Забрать себе")}
        </Button>
      );
    }
    return (
      <Button
        onClick={() => {
          void navigate({ to: "/auth/signin" });
        }}
      >
        {typo("Войти, чтобы забрать себе")}
      </Button>
    );
  };

  const restCount = exam.totalQuestions - exam.questions.length;

  return (
    <main className="min-h-dvh overflow-y-auto">
      <Container className="py-8">
        <VStack gap="xl">
          <VStack gap="sm">
            <Text variant="mini" color="supplementary">
              {typo("Мемокарты")}
            </Text>
            <Heading variant="h1">{typo(exam.title)}</Heading>
            <Text variant="small" color="supplementary">
              {exam.authorName
                ? typo(`Автор: ${exam.authorName} · вопросов: ${exam.totalQuestions} · карточек: ${exam.totalCards}`)
                : typo(`Вопросов: ${exam.totalQuestions} · карточек: ${exam.totalCards}`)}
            </Text>
            {exam.description && <Text color="supplementary">{typo(exam.description)}</Text>}
            {renderAction()}
            {showMultiExamPaywall && <PaywallCard reason="MULTI_EXAM" compact />}
            {!exam.isAuthenticated && (
              <Text variant="mini" color="supplementary">
                {typo("Экзамен можно скопировать к себе и готовиться со своим прогрессом — для этого нужен вход.")}
              </Text>
            )}
          </VStack>

          {exam.questions.length > 0 && (
            <SimpleCard title={typo("Вопросы")}>
              <VStack gap="2xs">
                {exam.questions.map((question, index) => (
                  <HStack key={question.id} gap="xs" align="center" wrap>
                    <Text variant="small" color="supplementary">
                      {index + 1}.
                    </Text>
                    <Text variant="small" breakWords>
                      {typo(question.text)}
                    </Text>
                    {question.topic && <Badge variant="outline">{typo(question.topic)}</Badge>}
                  </HStack>
                ))}
              </VStack>
              {restCount > 0 && (
                <Text variant="small" color="supplementary">
                  {typo(`…и ещё ${restCount} вопросов`)}
                </Text>
              )}
            </SimpleCard>
          )}
        </VStack>
      </Container>
    </main>
  );
}
