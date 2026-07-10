import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Container,
  Heading,
  HStack,
  Input,
  PaywallCard,
  ResponsiveModal,
  SimpleCard,
  Text,
  VStack,
} from "~/components";
import { isPaywallError, typo } from "~/lib";
import { forkExam, getPublicExam } from "~/server/fn/exams";

// Публичное превью экзамена: вопросы без ответов + «Забрать себе» — форк со своей датой
// и прогрессом с нуля. Гостю предлагаем войти.

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
        { property: "og:site_name", content: typo("Домашник") },
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

// Форк-модал: своя дата экзамена (или без даты) — план построится от неё.
function ForkModal({ examId, onClose }: { examId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [date, setDate] = useState("");
  const [noDate, setNoDate] = useState(false);
  const [showMultiExamPaywall, setShowMultiExamPaywall] = useState(false);

  const fork = useMutation({
    mutationFn: () => forkExam({ data: { id: examId, examDate: noDate ? null : date || null } }),
    onSuccess: (created) => {
      toast.success(typo("Экзамен скопирован — план построен от твоей даты"));
      void navigate({ to: "/app/exams/$examId", params: { examId: created.id } });
    },
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        setShowMultiExamPaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось скопировать экзамен");
      toast.error(humanMessage);
    },
  });

  return (
    <ResponsiveModal open onOpenChange={onClose} title={typo("Забрать экзамен себе")}>
      <VStack gap="md">
        <Text variant="small" color="supplementary">
          {typo("Когда у тебя экзамен? План повторений построится назад от этой даты, прогресс будет свой — с нуля.")}
        </Text>
        <HStack gap="sm" align="center" wrap>
          <Input
            value={date}
            type="date"
            className="w-44"
            disabled={noDate}
            aria-label={typo("Дата экзамена")}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={noDate}
              className="accent-primary"
              onChange={(event) => {
                setNoDate(event.target.checked);
              }}
            />
            <Text variant="small" color="supplementary">
              {typo("пока без даты")}
            </Text>
          </label>
        </HStack>
        {showMultiExamPaywall && <PaywallCard reason="MULTI_EXAM" compact />}
        <HStack gap="sm">
          <Button
            disabled={fork.isPending || (!noDate && !date)}
            onClick={() => {
              fork.mutate();
            }}
          >
            {fork.isPending ? typo("Копируем…") : typo("Забрать себе")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    </ResponsiveModal>
  );
}

function PublicExamPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const { data: exam } = useSuspenseQuery(publicExamQuery(examId));
  const [forkOpen, setForkOpen] = useState(false);

  const topics = [...new Set(exam.questions.map((question) => question.topic).filter((topic): topic is string => Boolean(topic)))];
  const restCount = exam.totalQuestions - exam.questions.length;

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
          size="pill"
          onClick={() => {
            setForkOpen(true);
          }}
        >
          {typo("Забрать себе")}
        </Button>
      );
    }
    return (
      <Button
        size="pill"
        onClick={() => {
          void navigate({ to: "/auth/signin" });
        }}
      >
        {typo("Войди и забери себе")}
      </Button>
    );
  };

  return (
    <main className="min-h-dvh overflow-y-auto">
      <Container className="py-8">
        <VStack gap="xl" className="mx-auto w-full max-w-2xl">
          <VStack gap="sm">
            <Text variant="mini" color="supplementary">
              {typo("Домашник · экзамен по ссылке")}
            </Text>
            <Heading variant="h1" breakWords>
              {typo(exam.title)}
            </Heading>
            <Text variant="small" color="supplementary">
              {exam.authorName
                ? typo(`Автор: ${exam.authorName} · вопросов: ${exam.totalQuestions} · карточек: ${exam.totalCards}`)
                : typo(`Вопросов: ${exam.totalQuestions} · карточек: ${exam.totalCards}`)}
            </Text>
            {exam.description && <Text color="supplementary">{typo(exam.description)}</Text>}
            {topics.length > 0 && (
              <HStack gap="2xs" wrap>
                {topics.map((topic) => (
                  <Badge key={topic} variant="outline">
                    {typo(topic)}
                  </Badge>
                ))}
              </HStack>
            )}
            <HStack>{renderAction()}</HStack>
            {!exam.isAuthenticated && (
              <Text variant="mini" color="supplementary">
                {typo("После входа экзамен скопируется к тебе: свой план от своей даты и честная готовность по припоминанию.")}
              </Text>
            )}
          </VStack>

          {exam.questions.length > 0 && (
            <SimpleCard title={typo("Вопросы")}>
              <VStack gap="2xs">
                {exam.questions.map((question, indexNumber) => (
                  <HStack key={question.id} gap="xs" wrap>
                    <Text variant="small" color="supplementary">
                      {indexNumber + 1}.
                    </Text>
                    <Text variant="small" breakWords>
                      {typo(question.text)}
                    </Text>
                  </HStack>
                ))}
              </VStack>
              {restCount > 0 && (
                <Text variant="small" color="supplementary">
                  {typo(`…и ещё ${restCount} вопросов — они откроются после копирования`)}
                </Text>
              )}
            </SimpleCard>
          )}
        </VStack>
      </Container>
      {forkOpen && (
        <ForkModal
          examId={examId}
          onClose={() => {
            setForkOpen(false);
          }}
        />
      )}
    </main>
  );
}
