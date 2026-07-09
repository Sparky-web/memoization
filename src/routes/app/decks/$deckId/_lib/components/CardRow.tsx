import { useState } from "react";

import { Badge, Button, ConfirmDialog, HStack, MarkdownView, Text, VStack } from "~/components";
import { type CardStage, cardStage, typo } from "~/lib";

import { useCardEditor } from "../model/deckMutations";
import type { DeckCard } from "../model/deckQueries";
import { CardDeepDialog } from "./CardDeepDialog";
import { CardFormModal } from "./CardFormModal";

const STAGE_META: Record<CardStage, { label: string; variant: "muted" | "default" | "primary" }> = {
  new: { label: typo("Новая"), variant: "muted" },
  learning: { label: typo("Изучается"), variant: "default" },
  mastered: { label: typo("Усвоена"), variant: "primary" },
};

interface CardRowProps {
  card: DeckCard;
  // У избранной чужой колоды карточки только для чтения (редактировать может лишь владелец).
  canEdit: boolean;
}

export function CardRow({ card, canEdit }: CardRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // editSession растёт при открытии — форма заново подхватывает актуальные значения карточки.
  const [editSession, setEditSession] = useState(0);
  const { update, remove } = useCardEditor();
  const stageMeta = STAGE_META[cardStage(card)];

  const openEdit = () => {
    setEditSession((current) => current + 1);
    setEditOpen(true);
  };

  return (
    <VStack gap="2xs" className="rounded-2xl bg-card p-4">
      <HStack justify="between" align="start" gap="sm">
        <Text bold>{typo(card.question)}</Text>
        <Badge variant={stageMeta.variant}>{stageMeta.label}</Badge>
      </HStack>
      <MarkdownView>{card.answer}</MarkdownView>
      <HStack gap="sm" wrap>
        {card.answerDeep && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDetailOpen(true);
            }}
          >
            {typo("Развернуть")}
          </Button>
        )}
        {canEdit && (
          <>
            <Button variant="ghost" size="sm" onClick={openEdit}>
              {typo("Изменить")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                setDeleteConfirmOpen(true);
              }}
            >
              {typo("Удалить")}
            </Button>
          </>
        )}
      </HStack>

      {canEdit && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={typo("Удалить карточку?")}
          description={typo("Карточка и её прогресс повторений будут удалены. Это действие необратимо.")}
          confirmLabel={typo("Удалить")}
          confirmPending={remove.isPending}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            remove.mutate(card.id);
          }}
        />
      )}

      {card.answerDeep && (
        <CardDeepDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          cardId={card.id}
          title={typo(card.question)}
          answerDeep={card.answerDeep}
          canChat={canEdit}
        />
      )}

      {canEdit && (
        <CardFormModal
          open={editOpen}
          onOpenChange={setEditOpen}
          formKey={editSession}
          title={typo("Редактирование карточки")}
          submitLabel={typo("Сохранить")}
          initialValues={{ question: card.question, answer: card.answer, answerDeep: card.answerDeep ?? "" }}
          pending={update.isPending}
          onSubmit={(result, options) => {
            update.mutate({ id: card.id, data: result }, options);
          }}
        />
      )}
    </VStack>
  );
}
