import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, Input, Label, Text, Textarea, VStack } from "~/components";
import { type ImportedDeck, parseImportedDeck, typo } from "~/lib";

import { useCreateDeck } from "../model/newDeckMutations";
import { ClaudePromptCard } from "./ClaudePromptCard";

type ParseState = { status: "ok"; deck: ImportedDeck } | { status: "error" } | null;

function clampRequired(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 10);
}

export function ManualDeckForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredCorrect, setRequiredCorrect] = useState(2);
  const [jsonText, setJsonText] = useState("");
  const create = useCreateDeck();

  const parseResult = useMemo<ParseState>(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) return null;
    try {
      return { status: "ok", deck: parseImportedDeck(trimmed) };
    } catch {
      return { status: "error" };
    }
  }, [jsonText]);

  const parsedTitle = parseResult?.status === "ok" ? parseResult.deck.title : "";
  const effectiveTitle = title.trim() || parsedTitle;
  const cardCount = parseResult?.status === "ok" ? parseResult.deck.cards.length : 0;

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!effectiveTitle) {
      toast.error(typo("Укажите название колоды"));
      return;
    }
    if (jsonText.trim() && parseResult?.status !== "ok") {
      toast.error(typo("JSON не распознан. Проверьте формат по образцу."));
      return;
    }
    create.mutate({
      title: effectiveTitle,
      description: description.trim() || null,
      requiredCorrect: clampRequired(requiredCorrect),
      cards: parseResult?.status === "ok" ? parseResult.deck.cards : [],
    });
  };

  return (
    <VStack gap="md">
      <ClaudePromptCard />
      <form onSubmit={handleSubmit}>
        <VStack gap="md">
          <div>
            <Label htmlFor="title">{typo("Название")}</Label>
            <Input
              id="title"
              value={title}
              placeholder={parsedTitle || undefined}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
            {!title.trim() && parsedTitle && (
              <Text variant="mini" color="supplementary">
                {typo(`Название из файла: ${parsedTitle}`)}
              </Text>
            )}
          </div>

          <div>
            <Label htmlFor="description">{typo("Описание (необязательно)")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </div>

          <div>
            <Label htmlFor="required">{typo("Сколько раз свайпнуть вправо для запоминания")}</Label>
            <Input
              id="required"
              type="number"
              min={1}
              max={10}
              value={requiredCorrect}
              onChange={(event) => {
                setRequiredCorrect(Number(event.target.value));
              }}
            />
          </div>

          <div>
            <Label htmlFor="json">{typo("JSON с карточками")}</Label>
            <Textarea
              id="json"
              className="min-h-40 font-mono"
              value={jsonText}
              placeholder={'{ "title": "…", "cards": [ { "question": "…", "answer": "…" } ] }'}
              onChange={(event) => {
                setJsonText(event.target.value);
              }}
            />
            {parseResult?.status === "ok" && (
              <Text variant="small" color="primary">
                {typo(`Распознано карточек: ${cardCount}`)}
              </Text>
            )}
            {parseResult?.status === "error" && (
              <Text variant="small" color="destructive">
                {typo("Не удалось разобрать JSON. Проверьте, что вставлен ответ Клода по образцу.")}
              </Text>
            )}
          </div>

          <Button type="submit" disabled={create.isPending}>
            {typo("Создать колоду")}
          </Button>
        </VStack>
      </form>
    </VStack>
  );
}
