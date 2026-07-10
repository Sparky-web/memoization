import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AdaptiveGrid,
  Badge,
  Button,
  Container,
  EmptyState,
  Heading,
  HStack,
  Input,
  PaywallCard,
  ResponsiveModal,
  SimpleCard,
  Stat,
  Text,
  VStack,
} from "~/components";
import { isPaywallError, typo } from "~/lib";
import { forkExam, getPublicExam, setExamFavorite } from "~/server/fn/exams";

import { riseDelay, SiteHeader } from "../../_lib";

// Публичное превью экзамена — мини-лендинг: вопросы без ответов + «Забрать себе» — форк
// со своей датой и прогрессом с нуля. Гостю предлагаем войти.

const publicExamQuery = (examId: string) =>
  queryOptions({
    queryKey: ["public-exam", examId],
    queryFn: () => getPublicExam({ data: { id: examId } }),
  });

function ogDescription(
  exam: { description: string | null; totalQuestions: number; totalCards: number } | undefined,
): string {
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
    <div className="min-h-dvh">
      <SiteHeader containerClassName="max-w-3xl" />
      <main>
        <Container className="max-w-3xl py-14 md:py-20">
          <EmptyState
            illustration="map"
            title={typo("Экзамен недоступен")}
            text={typo("Ссылка неверна или владелец закрыл доступ по ссылке.")}
          >
            <Button
              onClick={() => {
                void navigate({ to: "/" });
              }}
            >
              {typo("На главную")}
            </Button>
          </EmptyState>
        </Container>
      </main>
    </div>
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
          {typo(
            "Когда у тебя экзамен? План повторений построится назад от этой даты. Если ты уже учил эти карточки раньше — прогресс сохранится.",
          )}
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

/** Кольцо тем — брендовый акцент героя: градиентный обод, внутри количество тем билетов. */
function TopicsRing({ count }: { count: number }) {
  return (
    <div className="size-24 shrink-0 rounded-full bg-brand-gradient p-1 shadow-card">
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-card">
        <span className="font-headings text-(length:--heading-2-font-size) font-extrabold tracking-tight tabular-nums">
          {count}
        </span>
        <Text variant="mini" color="supplementary">
          {typo("тем")}
        </Text>
      </div>
    </div>
  );
}

/** Сколько тем показываем бейджами, прежде чем свернуть хвост в «+N». */
const TOPIC_BADGES_LIMIT = 8;

function PublicExamPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(publicExamQuery(examId));
  const [forkOpen, setForkOpen] = useState(false);

  // Избранное: закладка на чужой публичный экзамен — список живёт на «Сегодня».
  const favorite = useMutation({
    mutationFn: () => setExamFavorite({ data: { examId, favorite: !exam.isFavorite } }),
    onSuccess: (result) => {
      toast.success(
        result.favorite ? typo("Добавили в избранное — найдёшь его на «Сегодня»") : typo("Убрали из избранного"),
      );
      void queryClient.invalidateQueries({ queryKey: ["public-exam", examId] });
      void queryClient.invalidateQueries({ queryKey: ["exams", "favorites"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось обновить избранное"));
    },
  });

  const topics = [
    ...new Set(exam.questions.map((question) => question.topic).filter((topic): topic is string => Boolean(topic))),
  ];
  const restCount = exam.totalQuestions - exam.questions.length;
  const restTopics = topics.length - TOPIC_BADGES_LIMIT;

  const renderAction = () => {
    if (exam.isOwner) {
      return (
        <Button
          size="pill"
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
        <HStack gap="sm" wrap justify="center">
          <Button
            variant="brand"
            size="pill"
            onClick={() => {
              setForkOpen(true);
            }}
          >
            {typo("Забрать себе")}
          </Button>
          <Button
            variant="outline"
            size="pill"
            disabled={favorite.isPending}
            onClick={() => {
              favorite.mutate();
            }}
          >
            <Star className={exam.isFavorite ? "size-4 fill-current" : "size-4"} strokeWidth={1.8} />
            {exam.isFavorite ? typo("В избранном") : typo("В избранное")}
          </Button>
        </HStack>
      );
    }
    return (
      <Button
        variant="brand"
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
    <div className="min-h-dvh">
      <SiteHeader containerClassName="max-w-3xl">
        {!exam.isAuthenticated && (
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/auth/signin" })}>
            {typo("Войти")}
          </Button>
        )}
      </SiteHeader>

      <main className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden">
          <div className="absolute top-4 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
        </div>
        <Container className="max-w-3xl py-10 md:py-14">
          <VStack gap="2xl">
            {/* Герой: чей экзамен и что внутри */}
            <VStack gap="md" justify="center" className="rise text-center" style={riseDelay(0)}>
              <Badge variant="outline" className="mx-auto gap-1.5 border-primary/25 bg-card/60 px-3 py-1 text-primary">
                {typo("Экзамен по ссылке")}
              </Badge>
              <Heading variant="h1" breakWords align="center">
                {typo(exam.title)}
              </Heading>
              {exam.authorName && (
                <Text variant="small" color="supplementary" align="center">
                  {typo(`Собрал и поделился: ${exam.authorName}`)}
                </Text>
              )}
              {exam.description && (
                <div className="mx-auto max-w-xl">
                  <Text color="supplementary" align="center">
                    {typo(exam.description)}
                  </Text>
                </div>
              )}
              <VStack gap="xs" justify="center">
                {renderAction()}
                {!exam.isAuthenticated && (
                  <Text variant="mini" color="supplementary" align="center">
                    {typo("После входа экзамен скопируется к тебе: свой план от своей даты и прогресс с нуля.")}
                  </Text>
                )}
              </VStack>
            </VStack>

            {/* Цифры и кольцо тем — один ряд плиток по центру: без пустых хвостов на десктопе. */}
            <AdaptiveGrid
              cols={{ base: 2, md: topics.length ? 3 : 2 }}
              gap="sm"
              className="rise"
              style={riseDelay(1)}
            >
              <Stat align="center" label={typo("Вопросов")} value={exam.totalQuestions} />
              <Stat align="center" label={typo("Карточек")} value={exam.totalCards} />
              {topics.length > 0 && (
                <div className="col-span-2 flex items-center justify-center rounded-2xl bg-card p-4 shadow-card md:col-span-1">
                  <TopicsRing count={topics.length} />
                </div>
              )}
            </AdaptiveGrid>

            {/* Темы: что придётся выучить */}
            {topics.length > 0 && (
              <SimpleCard title={typo("Темы экзамена")} className="rise" style={riseDelay(2)}>
                <HStack gap="xs" wrap>
                  {topics.slice(0, TOPIC_BADGES_LIMIT).map((topic) => (
                    <Badge key={topic} variant="dot" dot="primary">
                      {typo(topic)}
                    </Badge>
                  ))}
                  {restTopics > 0 && <Badge variant="muted">{typo(`+${restTopics}`)}</Badge>}
                </HStack>
              </SimpleCard>
            )}

            {/* Вопросы без ответов: превью содержимого */}
            {exam.questions.length > 0 && (
              <SimpleCard title={typo("Вопросы")} className="rise" style={riseDelay(3)}>
                <VStack gap="xs">
                  {exam.questions.map((question, indexNumber) => (
                    <HStack key={question.id} gap="sm" align="start">
                      <span className="w-6 shrink-0 text-right font-semibold text-muted-foreground tabular-nums">
                        <Text variant="small">{indexNumber + 1}</Text>
                      </span>
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

            {/* Финальное приглашение: как работает копия */}
            {!exam.isOwner && (
              <SimpleCard size="lg" className="rise bg-accent/60" style={riseDelay(4)}>
                <VStack gap="md" justify="center" className="text-center">
                  <Heading variant="h3" asParagraph align="center">
                    {typo("Карточки общие — план твой")}
                  </Heading>
                  <div className="mx-auto max-w-xl">
                    <Text variant="small" color="supplementary" align="center">
                      {typo(
                        "Заберёшь копию — Домашник построит план повторений от твоей даты экзамена и будет считать честную готовность по твоему припоминанию.",
                      )}
                    </Text>
                  </div>
                  <div className="mx-auto">
                    <Button
                      size="pill"
                      onClick={() => {
                        if (!exam.isAuthenticated) {
                          void navigate({ to: "/auth/signin" });
                          return;
                        }
                        setForkOpen(true);
                      }}
                    >
                      {typo("Забрать себе")}
                    </Button>
                  </div>
                </VStack>
              </SimpleCard>
            )}
          </VStack>
        </Container>
      </main>
      {forkOpen && (
        <ForkModal
          examId={examId}
          onClose={() => {
            setForkOpen(false);
          }}
        />
      )}
    </div>
  );
}
