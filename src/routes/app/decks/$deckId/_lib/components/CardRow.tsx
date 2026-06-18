import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, HStack, Text, Textarea, VStack } from "~/components";
import { type CardStage, cardStage, typo } from "~/lib";

import { useCardEditor } from "../model/deckMutations";
import type { DeckCard } from "../model/deckQueries";

const STAGE_META: Record<CardStage, { label: string; variant: "muted" | "default" | "primary" }> = {
  new: { label: typo("Новая"), variant: "muted" },
  learning: { label: typo("Изучается"), variant: "default" },
  mastered: { label: typo("Усвоена"), variant: "primary" },
};

interface CardRowProps {
  card: DeckCard;
}

export function CardRow({ card }: CardRowProps) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const { update, remove } = useCardEditor();
  const stageMeta = STAGE_META[cardStage(card)];

  const startEdit = () => {
    setQuestion(card.question);
    setAnswer(card.answer);
    setEditing(true);
  };

  const save = () => {
    if (!question.trim() || !answer.trim()) {
      toast.error(typo("Заполните вопрос и ответ"));
      return;
    }
    update.mutate(
      { id: card.id, data: { question: question.trim(), answer: answer.trim() } },
      {
        onSuccess: () => {
          setEditing(false);
        },
      },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(typo("Удалить карточку?"))) return;
    remove.mutate(card.id);
  };

  if (editing) {
    return (
      <VStack gap="sm" className="bg-card rounded-2xl p-4">
        <Textarea
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
        />
        <Textarea
          value={answer}
          onChange={(event) => {
            setAnswer(event.target.value);
          }}
        />
        <HStack gap="sm">
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {typo("Сохранить")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
            }}
          >
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    );
  }

  return (
    <VStack gap="2xs" className="bg-card rounded-2xl p-4">
      <HStack justify="between" align="start" gap="sm">
        <Text bold>{typo(card.question)}</Text>
        <Badge variant={stageMeta.variant}>{stageMeta.label}</Badge>
      </HStack>
      <Text variant="small" color="supplementary">
        {typo(card.answer)}
      </Text>
      <HStack gap="sm">
        <Button variant="ghost" size="sm" onClick={startEdit}>
          {typo("Изменить")}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={remove.isPending}>
          {typo("Удалить")}
        </Button>
      </HStack>
    </VStack>
  );
}
