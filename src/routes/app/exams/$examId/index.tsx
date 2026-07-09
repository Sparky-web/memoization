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
  MarkdownView,
  PaywallCard,
  ResponsiveModal,
  SimpleCard,
  Stat,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { formatDateRuMsk, isPaywallError, PAYWALL_ERRORS, typo, zodRussian } from "~/lib";
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
import { archiveExam, deleteExam, generateExam, getExamById, setExamPublic, updateExam } from "~/server/fn/exams";
import { deleteMaterial } from "~/server/fn/materials";
import { getQuestionById, regenerateQuestionCards, setExamQuestions } from "~/server/fn/questions";

// Временный хаб экзамена волн 1–2: параметры, вопросы, материалы, запуск генерации,
// библиотека карточек и сессии. Полноценный хаб (кольца готовности, мастер) — волна 3.

const examQuery = (examId: string) =>
  queryOptions({
    queryKey: ["exams", "detail", examId],
    queryFn: () => getExamById({ data: { id: examId } }),
    // Пока идёт генерация — поллим статус (позицию в очереди и появление результата).
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 4000 : false),
  });

type ExamDetail = Awaited<ReturnType<typeof getExamById>>;

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

// Запуск двухпроходной генерации: первая — сразу, повторная — через confirm о полной замене.
function GenerationCard({ exam }: { exam: ExamDetail }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const generate = useMutation({
    mutationFn: () => generateExam({ data: { examId: exam.id } }),
    onSuccess: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      setConfirmOpen(false);
      if (isPaywallError(error, "GENERATION")) {
        setShowPaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось запустить генерацию");
      toast.error(humanMessage);
    },
  });

  const processing = exam.status === "processing";
  const hasGenerated = exam.questions.some((question) => question.hasAnswer);
  const processingLine = exam.queuePosition
    ? typo(`В очереди на генерацию: ${exam.queuePosition}`)
    : typo("Генерируется прямо сейчас — страница обновится сама.");

  return (
    <SimpleCard title={typo("Генерация")}>
      {processing ? (
        <Text variant="small" color="supplementary">
          {processingLine}
        </Text>
      ) : (
        <Text variant="small" color="supplementary">
          {typo(
            "ИИ ответит на каждый вопрос (по материалам — с цитатой источника) и соберёт атомарные карточки четырёх форматов.",
          )}
        </Text>
      )}
      <HStack gap="sm" align="center" wrap>
        <Button
          disabled={processing || generate.isPending || !exam.questions.length}
          onClick={() => {
            if (hasGenerated) {
              setConfirmOpen(true);
              return;
            }
            generate.mutate();
          }}
        >
          {hasGenerated ? typo("Перегенерировать") : typo("Сгенерировать ответы и карточки")}
        </Button>
        {!exam.questions.length && (
          <Text variant="small" color="supplementary">
            {typo("Сначала добавьте вопросы")}
          </Text>
        )}
      </HStack>
      {showPaywall && <PaywallCard reason="GENERATION" compact />}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={typo("Перегенерировать экзамен?")}
        description={typo(
          "Полная перегенерация заново ответит на все вопросы: прежние ответы и все ИИ-карточки вместе с их прогрессом будут заменены. Карточки, добавленные вручную, останутся.",
        )}
        confirmLabel={typo("Перегенерировать")}
        confirmPending={generate.isPending}
        onConfirm={() => {
          generate.mutate();
        }}
      />
    </SimpleCard>
  );
}

// Правка списка вопросов текстом: строка = вопрос; нумерация в начале строки отбрасывается.
function QuestionsEditorCard({ exam }: { exam: ExamDetail }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(exam.questions.map((question) => question.text).join("\n"));

  const save = useMutation({
    mutationFn: () => {
      const lines = text
        .split("\n")
        .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      return setExamQuestions({ data: { examId: exam.id, questions: lines } });
    },
    onSuccess: (result) => {
      toast.success(typo(`Сохранили вопросы: ${result.count}`));
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось сохранить вопросы");
      toast.error(humanMessage);
    },
  });

  return (
    <SimpleCard title={typo("Вопросы — по одному в строке")}>
      <Textarea
        value={text}
        rows={8}
        placeholder={typo("1. Первый вопрос\n2. Второй вопрос")}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <HStack gap="sm" align="center" wrap>
        <Button
          variant="outline"
          disabled={save.isPending || exam.status === "processing" || !text.trim()}
          onClick={() => {
            save.mutate();
          }}
        >
          {typo("Сохранить вопросы")}
        </Button>
        <Text variant="mini" color="supplementary">
          {typo("Сохранение заменяет весь список: ответы и привязка карточек сбросятся — потом перегенерируйте.")}
        </Text>
      </HStack>
    </SimpleCard>
  );
}

const uploadErrorText: Record<string, string> = {
  FILE_TOO_LARGE: typo("Файл больше 10 МБ"),
  FILE_TYPE: typo("Поддерживаются файлы pdf, docx, doc, txt и md"),
  TOO_MANY_FILES: typo("Не больше 5 файлов на экзамен"),
  EMPTY: typo("Выберите файлы"),
};

const uploadErrorSchema = zodRussian.object({ error: zodRussian.string() });

function formatFileSize(sizeBytes: number): string {
  const megabytes = sizeBytes / (1024 * 1024);
  if (megabytes >= 1) return typo(`${megabytes.toFixed(1)} МБ`);
  return typo(`${Math.max(1, Math.round(sizeBytes / 1024))} КБ`);
}

// Материалы: multipart-загрузка в /api/materials/$examId (Pro-гейт на сервере), список, удаление.
function MaterialsCard({ exam }: { exam: ExamDetail }) {
  const queryClient = useQueryClient();
  const [showPaywall, setShowPaywall] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // Смена ключа пересоздаёт input после успешной загрузки — сбрасывает выбранные файлы.
  const [inputKey, setInputKey] = useState(0);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      const response = await fetch(`/api/materials/${exam.id}`, { method: "POST", body: form });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = uploadErrorSchema.safeParse(payload);
        throw new Error(parsed.success ? parsed.data.error : "UPLOAD_FAILED");
      }
      return true;
    },
    onSuccess: () => {
      setFiles([]);
      setInputKey((key) => key + 1);
      invalidate();
    },
    onError: (error) => {
      if (error.message === PAYWALL_ERRORS.MATERIALS) {
        setShowPaywall(true);
        return;
      }
      console.error(error);
      toast.error(uploadErrorText[error.message] ?? typo("Не удалось загрузить материалы"));
    },
  });

  const remove = useMutation({
    mutationFn: (materialId: string) => deleteMaterial({ data: { id: materialId } }),
    onSuccess: invalidate,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить материал"));
    },
  });

  return (
    <SimpleCard title={typo("Материалы (Pro) — до 5 файлов по 10 МБ")}>
      {exam.materials.length > 0 && (
        <VStack gap="2xs">
          {exam.materials.map((material) => (
            <HStack key={material.id} justify="between" align="center" gap="sm" wrap>
              <Text variant="small" breakWords>
                {typo(material.fileName)}
              </Text>
              <HStack gap="sm" align="center">
                <Text variant="mini" color="supplementary">
                  {formatFileSize(material.sizeBytes)}
                </Text>
                <Button
                  variant="link"
                  size="inline"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(material.id);
                  }}
                >
                  {typo("Удалить")}
                </Button>
              </HStack>
            </HStack>
          ))}
        </VStack>
      )}
      <HStack gap="sm" align="center" wrap>
        <Input
          key={inputKey}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.md"
          className="max-w-xs"
          aria-label={typo("Файлы материалов")}
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []));
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={upload.isPending || !files.length}
          onClick={() => {
            upload.mutate();
          }}
        >
          {typo("Загрузить")}
        </Button>
      </HStack>
      {showPaywall && <PaywallCard reason="MATERIALS" compact />}
    </SimpleCard>
  );
}

// Страница вопроса в миниатюре: полный ответ, карточки, точечная перегенерация
// (квоту генераций не тратит, но ограничена мягким дневным лимитом).
function QuestionModal({ questionId, onClose }: { questionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const queryKey = ["questions", "detail", questionId];
  const detail = useQuery({ queryKey, queryFn: () => getQuestionById({ data: { id: questionId } }) });

  const regenerate = useMutation({
    mutationFn: () => regenerateQuestionCards({ data: { questionId } }),
    onSuccess: (result) => {
      toast.success(typo(`Пересобрали карточки: ${result.count}`));
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message)
        ? error.message
        : typo("Не удалось перегенерировать карточки");
      toast.error(humanMessage);
    },
  });

  const question = detail.data;
  return (
    <ResponsiveModal open onOpenChange={onClose} title={typo("Вопрос")}>
      {!question ? (
        <Text color="supplementary">{typo("Загружаем…")}</Text>
      ) : (
        <VStack gap="md">
          <Text bold breakWords>
            {typo(question.text)}
          </Text>
          <HStack gap="xs" wrap>
            {question.topic && <Badge variant="outline">{typo(question.topic)}</Badge>}
            {!question.covered && <Badge variant="muted">{typo("не покрыт материалами")}</Badge>}
            {question.aiGenerated && <Badge variant="muted">{typo("ответ из общих знаний ИИ")}</Badge>}
          </HStack>
          {question.sourceRef && (
            <Text variant="mini" color="supplementary" breakWords>
              {typo(`Источник: ${question.sourceRef}`)}
            </Text>
          )}
          {question.answerMd ? (
            <MarkdownView>{question.answerMd}</MarkdownView>
          ) : (
            <Text color="supplementary">{typo("Ответ ещё не сгенерирован.")}</Text>
          )}
          <HStack justify="between" align="center" gap="sm" wrap>
            <Heading variant="h3" asParagraph>
              {typo(`Карточки · ${question.cards.length}`)}
            </Heading>
            <Button
              variant="outline"
              size="sm"
              disabled={regenerate.isPending || !question.answerMd}
              onClick={() => {
                regenerate.mutate();
              }}
            >
              {regenerate.isPending ? typo("Пересобираем…") : typo("Перегенерировать карточки")}
            </Button>
          </HStack>
          <VStack gap="sm">
            {question.cards.map((card) => (
              <VStack key={card.id} gap="3xs" className="rounded-2xl bg-card p-3">
                <HStack gap="xs" wrap>
                  <Badge variant="muted">{formatBadgeLabel(card.format)}</Badge>
                  {card.suspended && <Badge variant="outline">{typo("выключена")}</Badge>}
                </HStack>
                <Text variant="small" bold breakWords>
                  {typo(card.prompt)}
                </Text>
                <Text variant="small" color="supplementary" breakWords>
                  {typo(card.answer)}
                </Text>
                {card.explanation && (
                  <Text variant="mini" color="supplementary" breakWords>
                    {typo(card.explanation)}
                  </Text>
                )}
              </VStack>
            ))}
          </VStack>
        </VStack>
      )}
    </ResponsiveModal>
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
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);

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

      <QuestionsEditorCard key={exam.questions.map((question) => question.id).join(",")} exam={exam} />
      <MaterialsCard exam={exam} />
      <GenerationCard exam={exam} />

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
                <Button
                  variant="link"
                  size="inline"
                  onClick={() => {
                    setOpenQuestionId(question.id);
                  }}
                >
                  {question.hasAnswer ? typo("Ответ и карточки") : typo("Открыть")}
                </Button>
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
      {openQuestionId && (
        <QuestionModal
          questionId={openQuestionId}
          onClose={() => {
            setOpenQuestionId(null);
          }}
        />
      )}
    </VStack>
  );
}
