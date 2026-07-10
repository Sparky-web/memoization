import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Ellipsis, Eye, EyeOff, Landmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ChatPanel,
  ConfirmDialog,
  EmptyState,
  HStack,
  Input,
  MarkdownView,
  PaywallCard,
  ResponsiveModal,
  SimpleCard,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { isPaywallError, typo } from "~/lib";

import {
  addCard,
  askCardChat,
  cardFormatLabel,
  Chip,
  deleteCard,
  type ExamCardItem,
  examQueries,
  flagCard,
  getCardChat,
  PalaceBlock,
  suspendCard,
  updateCard,
} from "../../../_lib";

// Библиотека карточек: поиск, фильтры, ручная правка и добавление, флаг «проверить»
// и выключение карточек из ротации.

type CardFormat = "open" | "mcq" | "cloze" | "truefalse";
type FormatFilter = "all" | CardFormat;
type StateFilter = "all" | "flagged" | "suspended";

const FORMAT_FILTERS: readonly { value: FormatFilter; label: string }[] = [
  { value: "all", label: typo("все форматы") },
  { value: "open", label: typo("открытые") },
  { value: "mcq", label: typo("тест") },
  { value: "cloze", label: typo("пропуск") },
  { value: "truefalse", label: typo("верно/неверно") },
];

const STATE_FILTERS: readonly { value: StateFilter; label: string }[] = [
  { value: "all", label: typo("все") },
  { value: "flagged", label: typo("проверить") },
  { value: "suspended", label: typo("выключенные") },
];

const CARD_FORMATS: readonly { value: CardFormat; label: string }[] = [
  { value: "open", label: typo("открытый") },
  { value: "mcq", label: typo("тест") },
  { value: "cloze", label: typo("пропуск") },
  { value: "truefalse", label: typo("верно/неверно") },
];

function toCardFormat(format: string): CardFormat {
  if (format === "mcq" || format === "cloze" || format === "truefalse") return format;
  return "open";
}

// Правка и ручное добавление: полные поля карточки, инварианты форматов проверяет сервер.
function CardEditorModal({
  examId,
  card,
  onClose,
}: {
  examId: string;
  card: ExamCardItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<CardFormat>(() => toCardFormat(card?.format ?? "open"));
  const [prompt, setPrompt] = useState(card?.prompt ?? "");
  const [answer, setAnswer] = useState(card?.answer ?? "");
  const [optionsText, setOptionsText] = useState(() => (card?.options ?? []).join("\n"));
  const [explanation, setExplanation] = useState(card?.explanation ?? "");

  const needsOptions = format === "mcq" || format === "cloze";
  const effectiveAnswer = format === "truefalse" ? answer : answer.trim();

  const save = useMutation({
    mutationFn: async () => {
      const options = needsOptions
        ? optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
      const fields = {
        format,
        prompt: prompt.trim(),
        answer: effectiveAnswer,
        options,
        explanation: explanation.trim() || null,
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

  const renderAnswerField = () => {
    if (format === "truefalse") {
      return (
        <HStack gap="2xs">
          <Chip
            active={answer === "true"}
            onClick={() => {
              setAnswer("true");
            }}
          >
            {typo("верно")}
          </Chip>
          <Chip
            active={answer === "false"}
            onClick={() => {
              setAnswer("false");
            }}
          >
            {typo("неверно")}
          </Chip>
        </HStack>
      );
    }
    return (
      <Textarea
        value={answer}
        rows={3}
        placeholder={typo("Верный ответ (кратко)")}
        onChange={(event) => {
          setAnswer(event.target.value);
        }}
      />
    );
  };

  return (
    <ResponsiveModal open onOpenChange={onClose} title={card ? typo("Правка карточки") : typo("Новая карточка")}>
      <VStack gap="md">
        <HStack gap="2xs" wrap>
          {CARD_FORMATS.map((option) => (
            <Chip
              key={option.value}
              active={format === option.value}
              onClick={() => {
                setFormat(option.value);
              }}
            >
              {option.label}
            </Chip>
          ))}
        </HStack>
        <Textarea
          value={prompt}
          rows={3}
          placeholder={
            format === "cloze" ? typo("Текст с пропуском: место пропуска отметьте «___»") : typo("Вопрос карточки")
          }
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        {renderAnswerField()}
        {needsOptions && (
          <VStack gap="3xs">
            <Textarea
              value={optionsText}
              rows={4}
              placeholder={typo("Варианты — по одному в строке (правильный тоже должен быть в списке)")}
              onChange={(event) => {
                setOptionsText(event.target.value);
              }}
            />
          </VStack>
        )}
        <Input
          value={explanation}
          placeholder={typo("Пояснение «почему» — покажется после ответа (необязательно)")}
          onChange={(event) => {
            setExplanation(event.target.value);
          }}
        />
        <HStack gap="sm">
          <Button
            disabled={save.isPending || !prompt.trim() || !effectiveAnswer}
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

// Чат по карточке («объясни почему») — существующая механика getCardChat/askCardChat.
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

// «Упрямая» карточка: три и больше провалов — предлагаем дворец памяти (мнемоника
// точечно для спотыкающихся карточек, спека «Мнемоники»).
const STUBBORN_LAPSES = 3;

// Текст карточки в списке — через markdown (формулы $…$ и таблицы). Cloze — плоским
// текстом: markdown съел бы «___» пропуска. Размер — токены small, как у прежнего Text.
const inlineSmallClasses = "text-(length:--paragraph-small-font-size) leading-(--paragraph-small-line-height)";

function CardPromptView({ card }: { card: ExamCardItem }) {
  if (card.format === "cloze") {
    return (
      <Text bold breakWords>
        {typo(card.prompt)}
      </Text>
    );
  }
  return (
    <MarkdownView variant="inline" className="font-semibold">
      {card.prompt}
    </MarkdownView>
  );
}

function CardAnswerView({ card }: { card: ExamCardItem }) {
  if (card.format === "truefalse") {
    return (
      <Text variant="small" color="supplementary" breakWords>
        {card.answer === "true" ? typo("верно") : typo("неверно")}
      </Text>
    );
  }
  return (
    <MarkdownView variant="inline" className={`${inlineSmallClasses} text-muted-foreground`}>
      {card.answer}
    </MarkdownView>
  );
}

// Частые действия — тихие ссылки: вторичное тише контента на два тона, primary остаётся hover'у.
const quietActionClasses = "font-semibold text-muted-foreground hover:text-primary";

// Редкие действия карточки прячутся в меню «⋯», чтобы список не превращался в стену ссылок.
function CardRowMenu({
  card,
  suspendPending,
  onToggleSuspend,
  onPalace,
  onDelete,
}: {
  card: ExamCardItem;
  suspendPending: boolean;
  onToggleSuspend: () => void;
  onPalace: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const runAndClose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const SuspendIcon = card.suspended ? Eye : EyeOff;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={typo("Ещё действия")}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
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
              setOpen(false);
            }}
          />
          <VStack gap="3xs" className="absolute top-11 right-0 z-20 w-56 rounded-xl bg-card p-1 shadow-card-hover">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={suspendPending}
              onClick={runAndClose(onToggleSuspend)}
            >
              <SuspendIcon className="size-4" strokeWidth={1.8} />
              {card.suspended ? typo("Включить в ротацию") : typo("Выключить из ротации")}
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={runAndClose(onPalace)}>
              <Landmark className="size-4" strokeWidth={1.8} />
              {typo("Дворец памяти")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={runAndClose(onDelete)}
            >
              <Trash2 className="size-4" strokeWidth={1.8} />
              {typo("Удалить")}
            </Button>
          </VStack>
        </>
      )}
    </div>
  );
}

function CardRow({
  card,
  examId,
  onEdit,
  onChat,
}: {
  card: ExamCardItem;
  examId: string;
  onEdit: () => void;
  onChat: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });
  const stubborn = (card.progress?.lapses ?? 0) >= STUBBORN_LAPSES;
  // Удаление необратимо уносит FSRS-прогресс и историю ответов — только через подтверждение.
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    onSuccess: () => {
      setConfirmDelete(false);
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить карточку"));
    },
  });

  const progressLine = card.progress
    ? typo(`повторений: ${card.progress.reps} · помню на ${Math.round(card.progress.retrievability * 100)}%`)
    : typo("новая");

  return (
    <VStack gap="2xs" className="rounded-2xl bg-card p-4 shadow-card">
      <HStack gap="xs" align="center" wrap>
        <Badge variant="muted">{cardFormatLabel(card.format)}</Badge>
        {card.kind === "full" && (
          <Badge variant="dot" dot="primary">
            {typo("полный вопрос")}
          </Badge>
        )}
        {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
        {card.flagged && (
          <Badge variant="dot" dot="primary">
            {typo("проверить")}
          </Badge>
        )}
        {card.suspended && (
          <Badge variant="dot" dot="muted">
            {typo("выключена")}
          </Badge>
        )}
        {card.progress?.priority && (
          <Badge variant="dot" dot="warning">
            {typo("приоритет")}
          </Badge>
        )}
      </HStack>
      <CardPromptView card={card} />
      <CardAnswerView card={card} />
      <Text variant="mini" color="supplementary">
        {progressLine}
      </Text>
      {stubborn && !card.palace && (
        <HStack>
          <Badge variant="dot" dot="flame">
            {typo("упрямая карточка — попробуй дворец памяти")}
          </Badge>
        </HStack>
      )}
      {card.palace && <PalaceBlock title={card.palace.title} loci={card.palace.loci} />}
      <HStack justify="between" align="center" gap="sm">
        <HStack gap="sm" align="center" wrap>
          <Button variant="link" size="inline" className={quietActionClasses} onClick={onEdit}>
            {typo("Править")}
          </Button>
          <Button variant="link" size="inline" className={quietActionClasses} onClick={onChat}>
            {typo("Спросить")}
          </Button>
          <Button
            variant="link"
            size="inline"
            className={quietActionClasses}
            disabled={toggleFlag.isPending}
            onClick={() => {
              toggleFlag.mutate();
            }}
          >
            {card.flagged ? typo("Снять флаг") : typo("Проверить")}
          </Button>
        </HStack>
        <CardRowMenu
          card={card}
          suspendPending={toggleSuspend.isPending}
          onToggleSuspend={() => {
            toggleSuspend.mutate();
          }}
          onPalace={() => {
            void navigate({ to: "/app/exams/$examId/palace/$cardId", params: { examId, cardId: card.id } });
          }}
          onDelete={() => {
            setConfirmDelete(true);
          }}
        />
      </HStack>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить карточку?")}
        description={typo("Вместе с карточкой безвозвратно удалятся её прогресс повторений и история ответов.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </VStack>
  );
}

export function CardsSection({ examId }: { examId: string }) {
  const cardsQuery = useQuery(examQueries.cards(examId));
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [editingCard, setEditingCard] = useState<ExamCardItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [chatCard, setChatCard] = useState<ExamCardItem | null>(null);

  const cards = cardsQuery.data ?? [];
  const needle = search.trim().toLowerCase();
  const filtered = cards.filter((card) => {
    if (formatFilter !== "all" && card.format !== formatFilter) return false;
    if (stateFilter === "flagged" && !card.flagged) return false;
    if (stateFilter === "suspended" && !card.suspended) return false;
    if (needle && !card.prompt.toLowerCase().includes(needle) && !card.answer.toLowerCase().includes(needle))
      return false;
    return true;
  });

  const renderList = () => {
    if (cardsQuery.isLoading) {
      return (
        <VStack gap="sm">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        </VStack>
      );
    }
    if (!cards.length) {
      return (
        <SimpleCard>
          <EmptyState
            illustration="cards"
            title={typo("Карточек пока нет")}
            text={typo("Добавьте карточку вручную или дождитесь генерации ответов.")}
          />
        </SimpleCard>
      );
    }
    if (!filtered.length) {
      return (
        <SimpleCard>
          <Text color="supplementary">{typo("По фильтрам ничего не нашлось.")}</Text>
        </SimpleCard>
      );
    }
    return (
      <VStack gap="sm">
        {filtered.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            examId={examId}
            onEdit={() => {
              setEditingCard(card);
            }}
            onChat={() => {
              setChatCard(card);
            }}
          />
        ))}
      </VStack>
    );
  };

  return (
    <VStack gap="md">
      <HStack justify="between" align="center" gap="sm" wrap>
        <Input
          value={search}
          placeholder={typo("Поиск по карточкам")}
          className="max-w-xs"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAdding(true);
          }}
        >
          <Plus className="size-4" />
          {typo("Добавить")}
        </Button>
      </HStack>
      <HStack gap="2xs" wrap>
        {FORMAT_FILTERS.map((option) => (
          <Chip
            key={option.value}
            active={formatFilter === option.value}
            onClick={() => {
              setFormatFilter(option.value);
            }}
          >
            {option.label}
          </Chip>
        ))}
      </HStack>
      <HStack gap="2xs" wrap>
        {STATE_FILTERS.map((option) => (
          <Chip
            key={option.value}
            active={stateFilter === option.value}
            onClick={() => {
              setStateFilter(option.value);
            }}
          >
            {option.label}
          </Chip>
        ))}
      </HStack>
      {renderList()}
      {(editingCard || adding) && (
        <CardEditorModal
          examId={examId}
          card={editingCard}
          onClose={() => {
            setEditingCard(null);
            setAdding(false);
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
