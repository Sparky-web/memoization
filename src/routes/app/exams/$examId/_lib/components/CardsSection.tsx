import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ChatPanel,
  HStack,
  Input,
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
function CardEditorModal({ examId, card, onClose }: { examId: string; card: ExamCardItem | null; onClose: () => void }) {
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
          placeholder={format === "cloze" ? typo("Текст с пропуском: место пропуска отметьте «___»") : typo("Вопрос карточки")}
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

function CardRow({ card, examId, onEdit, onChat }: { card: ExamCardItem; examId: string; onEdit: () => void; onChat: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["exams"] });
  const stubborn = (card.progress?.lapses ?? 0) >= STUBBORN_LAPSES;

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
    ? typo(`повторений: ${card.progress.reps} · помню на ${Math.round(card.progress.retrievability * 100)}%`)
    : typo("новая");

  return (
    <VStack gap="2xs" className="rounded-2xl bg-card p-4">
      <HStack gap="xs" align="center" wrap>
        <Badge variant="muted">{cardFormatLabel(card.format)}</Badge>
        {card.topic && <Badge variant="outline">{typo(card.topic)}</Badge>}
        {card.flagged && <Badge variant="primary">{typo("проверить")}</Badge>}
        {card.suspended && <Badge variant="outline">{typo("выключена")}</Badge>}
        {card.progress?.priority && <Badge className="bg-warning/15 text-warning">{typo("приоритет")}</Badge>}
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
      {stubborn && !card.palace && (
        <HStack>
          <Badge className="bg-warning/15 text-warning">{typo("упрямая карточка — попробуй дворец памяти")}</Badge>
        </HStack>
      )}
      {card.palace && <PalaceBlock title={card.palace.title} loci={card.palace.loci} />}
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
          onClick={() => {
            void navigate({ to: "/app/exams/$examId/palace/$cardId", params: { examId, cardId: card.id } });
          }}
        >
          {card.palace ? typo("🏛️ Дворец") : typo("Дворец памяти")}
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
    if (needle && !card.prompt.toLowerCase().includes(needle) && !card.answer.toLowerCase().includes(needle)) return false;
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
          <Text color="supplementary">{typo("Карточек пока нет — добавьте вручную или дождитесь генерации.")}</Text>
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
