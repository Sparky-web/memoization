import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ChevronRight, Ellipsis, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Heading,
  HStack,
  ReadinessRing,
  SimpleCard,
  Text,
  VStack,
} from "~/components";
import { formatDateRuMsk, isPaywallError, typo } from "~/lib";

import {
  archiveExam,
  cardsCountLabel,
  daysToExamLabel,
  deleteExam,
  type ExamListItem,
  examQueries,
  questionsCountLabel,
  setExamPaused,
} from "./_lib";

// Список всех экзаменов, включая архив. Оперативный экран — «Сегодня»; здесь навигация,
// обзор и редкие действия (пауза, архив, удаление) в тихом меню «⋯».

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

// Редкие действия экзамена — в тихом меню «⋯» (паттерн CardRowMenu из библиотеки карточек).
// Открытость меню контролирует ExamRow: карточка с rise-анимацией — stacking context,
// и без подъёма z-index открытой строки меню перекрывалось бы следующей карточкой.
function ExamRowMenu({
  exam,
  open,
  onOpenChange,
}: {
  exam: ExamListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
  };

  const togglePause = useMutation({
    mutationFn: () => setExamPaused({ data: { id: exam.id, paused: !exam.pausedAt } }),
    onSuccess: (result) => {
      toast.success(result.paused ? typo("Экзамен на паузе — из плана дня исключён") : typo("Экзамен снова в плане"));
      invalidate();
    },
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        toast.info(typo("Лимит активных экзаменов занят — сначала поставьте на паузу или заархивируйте другой"));
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось изменить паузу"));
    },
  });

  const toggleArchive = useMutation({
    mutationFn: () => archiveExam({ data: { id: exam.id, archived: !exam.archivedAt } }),
    onSuccess: invalidate,
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        toast.info(typo("Бесплатно доступен один активный экзамен — сначала заархивируйте текущий"));
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось изменить архив"));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteExam({ data: { id: exam.id } }),
    onSuccess: () => {
      setConfirmDelete(false);
      toast.success(typo("Экзамен удалён"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить экзамен"));
    },
  });

  const runAndClose = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  const PauseIcon = exam.pausedAt ? Play : Pause;
  const ArchiveIcon = exam.archivedAt ? ArchiveRestore : Archive;

  return (
    <div
      className="relative"
      // Меню живёт внутри кликабельной карточки-ссылки — клики не должны открывать хаб.
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={typo("Ещё действия")}
        aria-expanded={open}
        onClick={() => {
          onOpenChange(!open);
        }}
      >
        <Ellipsis className="size-5" strokeWidth={1.8} />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label={typo("Закрыть меню")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              onOpenChange(false);
            }}
          />
          <VStack gap="3xs" className="absolute top-11 right-0 z-20 w-60 rounded-xl bg-card p-1 shadow-card-hover">
            {!exam.archivedAt && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                disabled={togglePause.isPending}
                onClick={runAndClose(() => {
                  togglePause.mutate();
                })}
              >
                <PauseIcon className="size-4" strokeWidth={1.8} />
                {exam.pausedAt ? typo("Возобновить") : typo("Пауза")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={toggleArchive.isPending}
              onClick={runAndClose(() => {
                toggleArchive.mutate();
              })}
            >
              <ArchiveIcon className="size-4" strokeWidth={1.8} />
              {exam.archivedAt ? typo("Вернуть из архива") : typo("Архивировать")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={runAndClose(() => {
                setConfirmDelete(true);
              })}
            >
              <Trash2 className="size-4" strokeWidth={1.8} />
              {typo("Удалить")}
            </Button>
          </VStack>
        </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo(`Удалить «${exam.title}»?`)}
        description={typo("Вопросы, карточки и весь прогресс повторений будут удалены безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </div>
  );
}

// Строка экзамена: карточка-ссылка на хаб с подъёмом на hover + тихое меню действий.
function ExamRow({ exam, riseDelayMs }: { exam: ExamListItem; riseDelayMs: number }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SimpleCard
      interactive
      // rise-анимация оставляет transform → каждая карточка становится stacking context;
      // открытая строка поднимается над соседями, иначе её меню перекрыла бы карточка ниже.
      className={menuOpen ? "rise relative z-20" : "rise"}
      style={{ animationDelay: `${riseDelayMs}ms` }}
      onClick={() => {
        void navigate({ to: "/app/exams/$examId", params: { examId: exam.id } });
      }}
    >
      <HStack justify="between" align="center" gap="md">
        <HStack gap="md" align="center" className="min-w-0">
          <ReadinessRing value={exam.readiness} size="sm" />
          <VStack gap="3xs" className="min-w-0">
            <HStack gap="xs" align="center" wrap>
              <Text bold breakWords>
                {typo(exam.title)}
              </Text>
              {statusBadge(exam)}
              {exam.pausedAt && !exam.archivedAt && (
                <Badge variant="dot" dot="warning">
                  {typo("на паузе")}
                </Badge>
              )}
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
        <HStack gap="2xs" align="center" className="shrink-0">
          <ExamRowMenu exam={exam} open={menuOpen} onOpenChange={setMenuOpen} />
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
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
