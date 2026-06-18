import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button, Heading, HStack, VStack } from "~/components";
import { typo } from "~/lib";

import { GenerateDeckForm } from "./_lib/components/GenerateDeckForm";
import { ManualDeckForm } from "./_lib/components/ManualDeckForm";

export const Route = createFileRoute("/app/decks/new/")({
  head: () => ({ meta: [{ title: typo("Новая колода") }] }),
  component: NewDeckPage,
});

function NewDeckPage() {
  const [mode, setMode] = useState<"generate" | "manual">("generate");

  return (
    <VStack gap="xl" className="max-w-2xl">
      <Heading variant="h1">{typo("Новая колода")}</Heading>
      <HStack gap="sm">
        <Button
          variant={mode === "generate" ? "default" : "outline"}
          onClick={() => {
            setMode("generate");
          }}
        >
          {typo("Сгенерировать")}
        </Button>
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => {
            setMode("manual");
          }}
        >
          {typo("Вручную (JSON)")}
        </Button>
      </HStack>
      {mode === "generate" ? <GenerateDeckForm /> : <ManualDeckForm />}
    </VStack>
  );
}
