import { useState } from "react";
import { toast } from "sonner";

import { Button, Heading, HStack, Input, Label, Text, Textarea, VStack } from "~/components";
import { typo } from "~/lib";

import { useDeckActions } from "../model/deckMutations";
import type { DeckDetail } from "../model/deckQueries";

interface DeckHeaderProps {
  deck: DeckDetail;
}

export function DeckHeader({ deck }: DeckHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(deck.title);
  const [description, setDescription] = useState(deck.description ?? "");
  const { rename, removeDeck } = useDeckActions(deck.id);

  const startEdit = () => {
    setTitle(deck.title);
    setDescription(deck.description ?? "");
    setEditing(true);
  };

  const save = () => {
    if (!title.trim()) {
      toast.error(typo("Укажите название колоды"));
      return;
    }
    rename.mutate(
      { title: title.trim(), description: description.trim() || null },
      {
        onSuccess: () => {
          setEditing(false);
        },
      },
    );
  };

  const handleRemove = () => {
    if (!window.confirm(typo("Удалить колоду со всеми карточками? Это действие необратимо."))) return;
    removeDeck.mutate();
  };

  if (editing) {
    return (
      <VStack gap="sm" className="bg-card rounded-2xl p-4">
        <div>
          <Label htmlFor="deck-title">{typo("Название")}</Label>
          <Input
            id="deck-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="deck-description">{typo("Описание")}</Label>
          <Textarea
            id="deck-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <HStack gap="sm">
          <Button onClick={save} disabled={rename.isPending}>
            {typo("Сохранить")}
          </Button>
          <Button
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
    <VStack gap="sm">
      <HStack justify="between" align="start" gap="md" wrap>
        <Heading variant="h1">{typo(deck.title)}</Heading>
        <HStack gap="sm">
          <Button variant="outline" size="sm" onClick={startEdit}>
            {typo("Редактировать")}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleRemove} disabled={removeDeck.isPending}>
            {typo("Удалить")}
          </Button>
        </HStack>
      </HStack>
      {deck.description && <Text color="supplementary">{typo(deck.description)}</Text>}
    </VStack>
  );
}
