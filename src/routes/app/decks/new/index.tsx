import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, Heading, Input, Label, Text, Textarea, VStack } from "~/components";
import { type ImportedDeck, parseImportedDeck, typo } from "~/lib";
import { createDeck } from "~/server/fn/decks";

import { ClaudePromptCard } from "./_lib/components/ClaudePromptCard";

type ParseState = { status: "ok"; deck: ImportedDeck } | { status: "error" } | null;

export const Route = createFileRoute("/app/decks/new/")({
  head: () => ({ meta: [{ title: typo("Новая колода") }] }),
  component: NewDeckPage,
});

function NewDeckPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [jsonText, setJsonText] = useState("");

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

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; description: string | null; cards: ImportedDeck["cards"] }) =>
      createDeck({ data: payload }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast.success(typo("Колода создана"));
      void navigate({ to: "/app/decks/$deckId", params: { deckId: result.id } });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось создать колоду"));
    },
  });

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
    createMutation.mutate({
      title: effectiveTitle,
      description: description.trim() || null,
      cards: parseResult?.status === "ok" ? parseResult.deck.cards : [],
    });
  };

  return (
    <VStack gap="xl" className="max-w-2xl">
      <Heading variant="h1">{typo("Новая колода")}</Heading>

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

          <Button type="submit" disabled={createMutation.isPending}>
            {typo("Создать колоду")}
          </Button>
        </VStack>
      </form>
    </VStack>
  );
}
