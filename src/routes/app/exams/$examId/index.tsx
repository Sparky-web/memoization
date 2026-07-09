import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  AdaptiveGrid,
  Badge,
  Button,
  ChatPanel,
  ConfirmDialog,
  Heading,
  HStack,
  Input,
  PaywallCard,
  ResponsiveModal,
  SimpleCard,
  Stat,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { formatDateRuMsk, isPaywallError, typo } from "~/lib";
import {
  addCard,
  deleteCard,
  type ExamCardItem,
  flagCard,
  getExamCards,
  suspendCard,
  updateCard,
} from "~/server/fn/cards";
import { askCardChat, getCardChat } from "~/server/fn/chat";
import { archiveExam, deleteExam, getExamById, setExamPublic, updateExam } from "~/server/fn/exams";

// Временный хаб экзамена волны 1: параметры, вопросы, библиотека карточек и запуск сессий.
// Полноценный хаб (готовность по темам кольцами, материалы, страницы вопросов) — волна 3.

const examQuery = (examId: string) =>
  queryOptions({
    queryKey: ["exams", "detail", examId],
    queryFn: () => getExamById({ data: { id: examId } }),
  });

const examCardsQuery = (examId: string) =>
  queryOptions({
    queryKey: ["exams", "cards", examId],
    queryFn: () => getExamCards({ data: { examId } }),
  });

export const Route = createFileRoute("/app/exams/$examId/")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(examQuery(params.examId));
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

function formatBadgeLabel(format: string): string {
  const labels: Record<string, string> = {
    open: typo("открытый"),
    mcq: typo("тест"),
    cloze: typo("пропуск"),
    truefalse: typo("верно/неверно"),
  };
  return labels[format] ?? format;
}

// Чат по карточке («объясни почему») — тот же getCardChat/askCardChat, что и раньше.
function CardChatModal({ card, onClose }: { card: ExamCardItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const queryKey = ["cardChat", card.id];
  const chat = useQuery({ queryKey, queryFn: () => getCardChat({ data: { cardId: card.id } }) });

  const ask = useMutation({
    mutationFn: (message: string) => askCardChat({ data: { cardId: card.id, message } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      if (isPaywallError(error, "CHAT")) return;
      console.error(error);
      toast.error(typo("Не удалось отправить вопрос"));
    },
  });

  return (
    <ResponsiveModal open onOpenChange={onClose} title={typo("Вопрос по карточке")}>
      <VStack gap="md">
        <Text variant="small" color="supplementary" maxLines={3}>
          {typo(card.prompt)}
        </Text>
        {isPaywallError(ask.error, "CHAT") ? (
          <PaywallCard reason="CHAT" compact />
        ) : (
          <ChatPanel
            messages={chat.data?.messages ?? []}
            pending={ask.isPending}
            pendingQuestion={ask.isPending ? (ask.variables ?? null) : null}
            onSend={(text) => {
              ask.mutate(text);
            }}
          />
        )}
      </VStack>
    </ResponsiveModal>
  );
}

// В БД format — строка; валидатор ждёт литеральный союз — сужаем без «as».
function toCardFormat(format: string): "open" | "mcq" | "cloze" | "truefalse" {
  if (format === "mcq") return "mcq";
  if (format === "cloze") return "cloze";
  if (format === "truefalse") return "truefalse";
  return "open";
}

// Правка/добавление карточки: волна 1 редактирует текст вопроса и ответа, формат сохраняется.
function CardFormModal({
  examId,
  card,
  onClose,
}: {
  examId: string;
  card: ExamCardItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState(card?.prompt ?? "");
  const [answer, setAnswer] = useState(card?.answer ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const fields = {
        format: toCardFormat(card?.format ?? "open"),
        prompt: prompt.trim(),
        answer: answer.trim(),
        options: card?.options ?? [],
        explanation: card?.explanation ?? null,
        deepMd: card?.deepMd ?? null,
        mnemonic: card?.mnemonic ?? null,
      };
      if (card) {
        await updateCard({ data: { id: card.id, data: fields } });
      } else {
        await addCard({ data: { examId, data: fields } });
      }
      return true;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      onClose();
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось сохранить карточку");
      toast.error(humanMessage);
    },
  });

  return (
    <ResponsiveModal open onOpenChange={onClose} title={card ? typo("Правка карточки") : typo("Новая карточка")}>
      <VStack gap="md">
        <Textarea
          value={prompt}
          rows={3}
          placeholder={typo("Вопрос карточки")}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        <Textarea
          value={answer}
          rows={4}
          placeholder={typo("Верный ответ")}
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
        />
        <HStack gap="sm">
          <Button
            disabled={save.isPending || !prompt.trim() || !answer.trim()}
            onClick={() => {
              save.mutate();
            }}
          >
            {typo("Сохранить")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    </ResponsiveModal>
  );
}

function CardRow({
  card,
  onEdit,
  onChat,
}: {
  card: ExamCardItem;
  onEdit: () => void;
  onChat: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });

  const toggleFlag = useMutation({
    mutationFn: () => flagCard({ data: { id: card.id, flagged: !card.flagged } }),
    onSuccess: invalidate,
  });
  const toggleSuspend = useMutation({
    mutationFn: () => suspendCard({ data: { id: card.id, suspended: !card.suspended } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteCard({ data: { id: card.id } }),
    onSuccess: invalidate,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить карточку"));
    },
  });

  const progressLine = card.progress
    ? typo(
        `повторений: ${card.progress.reps} · помню на ${Math.round(card.progress.retrievability * 100)}% · освоено дней: ${card.progress.masteredDays}`,
      )
    : typo("новая");

  return (
    <VStack gap="2xs" className="rounded-2xl bg-card p-4">
      <HStack gap="xs" align="center" wrap>
        <Badge variant="muted">{formatBadgeLabel(card.format)}</Badge>
        {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
        {card.flagged && <Badge variant="primary">{typo("проверить")}</Badge>}
        {card.suspended && <Badge variant="outline">{typo("выключена")}</Badge>}
        {card.progress?.priority && <Badge variant="primary">{typo("приоритет")}</Badge>}
      </HStack>
      <Text bold breakWords>
        {typo(card.prompt)}
      </Text>
      <Text variant="small" color="supplementary" breakWords>
        {typo(card.answer)}
      </Text>
      <Text variant="mini" color="supplementary">
        {progressLine}
      </Text>
      <HStack gap="sm" wrap>
        <Button variant="link" size="inline" onClick={onEdit}>
          {typo("Править")}
        </Button>
        <Button variant="link" size="inline" onClick={onChat}>
          {typo("Спросить")}
        </Button>
        <Button
          variant="link"
          size="inline"
          disabled={toggleFlag.isPending}
          onClick={() => {
            toggleFlag.mutate();
          }}
        >
          {card.flagged ? typo("Снять флаг") : typo("Проверить")}
        </Button>
        <Button
          variant="link"
          size="inline"
          disabled={toggleSuspend.isPending}
          onClick={() => {
            toggleSuspend.mutate();
          }}
        >
          {card.suspended ? typo("Включить") : typo("Выключить")}
        </Button>
        <Button
          variant="link"
          size="inline"
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {typo("Удалить")}
        </Button>
      </HStack>
    </VStack>
  );
}

function ExamHubPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQuery(examId));
  const cardsQuery = useQuery(examCardsQuery(examId));

  const [examDate, setExamDate] = useState(exam.examDate ? new Date(exam.examDate).toISOString().slice(0, 10) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCard, setEditingCard] = useState<ExamCardItem | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [chatCard, setChatCard] = useState<ExamCardItem | null>(null);
  const [showCramPaywall, setShowCramPaywall] = useState(false);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });

  const saveDate = useMutation({
    mutationFn: () => updateExam({ data: { id: examId, data: { examDate: examDate || null } } }),
    onSuccess: () => {
      toast.success(typo("Дата сохранена"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить дату"));
    },
  });

  const setMode = useMutation({
    mutationFn: (mode: "long" | "cram") => updateExam({ data: { id: examId, data: { mode } } }),
    onSuccess: invalidate,
    onError: (error) => {
      if (isPaywallError(error, "CRAM")) {
        setShowCramPaywall(true);
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось сменить режим"));
    },
  });

  const togglePublic = useMutation({
    mutationFn: () => setExamPublic({ data: { id: examId, isPublic: !exam.isPublic } }),
    onSuccess: invalidate,
  });

  const toggleArchive = useMutation({
    mutationFn: () => archiveExam({ data: { id: examId, archived: !exam.archivedAt } }),
    onSuccess: invalidate,
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        toast.info(typo("Free — один активный экзамен: сначала заархивируйте текущий"));
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось изменить архив"));
    },
  });

  const removeExam = useMutation({
    mutationFn: () => deleteExam({ data: { id: examId } }),
    onSuccess: () => {
      invalidate();
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить экзамен"));
    },
  });

  const cards = cardsQuery.data ?? [];
  const goSession = (kind: "daily" | "pretest" | "bedtime" | "cram") => {
    void navigate({ to: "/app/exams/$examId/session", params: { examId }, search: { kind } });
  };

  return (
    <VStack gap="xl">
      <VStack gap="sm">
        <HStack gap="xs" align="center" wrap>
          <Heading variant="h1">{typo(exam.title)}</Heading>
          {exam.status === "processing" && <Badge variant="muted">{typo("генерируется…")}</Badge>}
          {exam.status === "failed" && <Badge variant="outline">{typo("ошибка генерации")}</Badge>}
          {exam.archivedAt && <Badge variant="outline">{typo("в архиве")}</Badge>}
          {exam.mode === "cram" && <Badge variant="primary">{typo("умная зубрёжка")}</Badge>}
        </HStack>
        {exam.generationError && (
          <Text variant="small" color="supplementary">
            {typo(exam.generationError)}
          </Text>
        )}
        <Text variant="small" color="supplementary">
          {exam.examDate
            ? typo(`Экзамен ${formatDateRuMsk(new Date(exam.examDate))} · осталось дней: ${exam.daysToExam ?? 0}`)
            : typo("Дата экзамена не назначена — поддерживающее повторение")}
        </Text>
      </VStack>

      <AdaptiveGrid cols={{ base: 2, md: 5 }} gap="sm">
        <Stat label={typo("Готовность")} value={`${Math.round(exam.readiness * 100)}%`} />
        <Stat label={typo("Карточек")} value={exam.counters.totalCards} />
        <Stat label={typo("К повторению")} value={exam.counters.due} />
        <Stat label={typo("Новых")} value={exam.counters.new} />
        <Stat label={typo("Выключено")} value={exam.counters.suspended} />
      </AdaptiveGrid>

      <SimpleCard title={typo("Сессии")}>
        <HStack gap="sm" wrap>
          <Button onClick={() => {
              goSession("daily");
            }}>{typo("Дневная сессия")}</Button>
          <Button variant="outline" onClick={() => {
              goSession("pretest");
            }}>
            {typo("Претест")}
          </Button>
          <Button variant="outline" onClick={() => {
              goSession("bedtime");
            }}>
            {typo("Перед сном")}
          </Button>
          <Button variant="outline" onClick={() => {
              goSession("cram");
            }}>
            {typo("Умная зубрёжка")}
          </Button>
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Параметры")}>
        <HStack gap="sm" align="center" wrap>
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
            variant="outline"
            size="sm"
            disabled={saveDate.isPending}
            onClick={() => {
              saveDate.mutate();
            }}
          >
            {typo("Сохранить дату")}
          </Button>
        </HStack>
        <HStack gap="sm" align="center" wrap>
          <Text variant="small" color="supplementary">
            {typo("Режим:")}
          </Text>
          <Button
            variant={exam.mode === "long" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setMode.mutate("long");
            }}
          >
            {typo("Долгая подготовка")}
          </Button>
          <Button
            variant={exam.mode === "cram" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              setMode.mutate("cram");
            }}
          >
            {typo("Умная зубрёжка")}
          </Button>
        </HStack>
        {showCramPaywall && <PaywallCard reason="CRAM" compact />}
        <HStack gap="sm" align="center" wrap>
          <Button
            variant="outline"
            size="sm"
            disabled={togglePublic.isPending}
            onClick={() => {
              togglePublic.mutate();
            }}
          >
            {exam.isPublic ? typo("Закрыть доступ по ссылке") : typo("Поделиться по ссылке")}
          </Button>
          {exam.isPublic && (
            <Text variant="small" color="supplementary">
              {typo(`Ссылка: /d/${exam.id}`)}
            </Text>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={toggleArchive.isPending}
            onClick={() => {
              toggleArchive.mutate();
            }}
          >
            {exam.archivedAt ? typo("Вернуть из архива") : typo("В архив")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {typo("Удалить экзамен")}
          </Button>
        </HStack>
      </SimpleCard>

      {exam.topics.length > 0 && (
        <SimpleCard title={typo("Темы")}>
          <VStack gap="2xs">
            {exam.topics.map((topic) => (
              <HStack key={topic.topic ?? "-"} justify="between" gap="sm" wrap>
                <Text variant="small">{topic.topic ? typo(topic.topic) : typo("Без темы")}</Text>
                <Text variant="small" color="supplementary">
                  {typo(`${topic.cardCount} карт. · готовность ${Math.round(topic.readiness * 100)}%`)}
                </Text>
              </HStack>
            ))}
          </VStack>
        </SimpleCard>
      )}

      {exam.questions.length > 0 && (
        <SimpleCard title={typo(`Вопросы · ${exam.questions.length}`)}>
          <VStack gap="2xs">
            {exam.questions.map((question) => (
              <HStack key={question.id} gap="xs" align="center" wrap>
                <Text variant="small" color="supplementary">
                  {question.position + 1}.
                </Text>
                <Text variant="small" breakWords>
                  {typo(question.text)}
                </Text>
                {question.topic && <Badge variant="outline">{typo(question.topic)}</Badge>}
                {!question.covered && <Badge variant="muted">{typo("не покрыт материалами")}</Badge>}
              </HStack>
            ))}
          </VStack>
        </SimpleCard>
      )}

      <VStack gap="md">
        <HStack justify="between" align="center" gap="md" wrap>
          <Heading variant="h2">{typo("Карточки")}</Heading>
          <Button
            variant="outline"
            onClick={() => {
              setAddingCard(true);
            }}
          >
            {typo("Добавить карточку")}
          </Button>
        </HStack>
        {cardsQuery.isLoading && <Text color="supplementary">{typo("Загружаем карточки…")}</Text>}
        {!cardsQuery.isLoading && !cards.length && (
          <Text color="supplementary">{typo("Карточек пока нет — добавьте вручную или дождитесь генерации.")}</Text>
        )}
        <VStack gap="sm">
          {cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              onEdit={() => {
                setEditingCard(card);
              }}
              onChat={() => {
                setChatCard(card);
              }}
            />
          ))}
        </VStack>
      </VStack>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить экзамен?")}
        description={typo("Вопросы, карточки и весь прогресс по ним будут удалены безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={removeExam.isPending}
        onConfirm={() => {
          removeExam.mutate();
        }}
      />

      {(editingCard || addingCard) && (
        <CardFormModal
          examId={examId}
          card={editingCard}
          onClose={() => {
            setEditingCard(null);
            setAddingCard(false);
          }}
        />
      )}
      {chatCard && (
        <CardChatModal
          card={chatCard}
          onClose={() => {
            setChatCard(null);
          }}
        />
      )}
    </VStack>
  );
}
