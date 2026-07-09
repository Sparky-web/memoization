import { Link } from "@tanstack/react-router";

import { Badge, Heading, HStack, ProgressBar, Text, VStack } from "~/components";
import { typo } from "~/lib";

import type { DeckListItem } from "../model/dashboardQueries";

interface DeckCardProps {
  deck: DeckListItem;
}

// Подпись для колоды в обработке: позиция в очереди генерации или «генерируется сейчас».
function processingLabel(queuePosition: number | null): string {
  if (queuePosition && queuePosition > 0) return typo(`В очереди: ${queuePosition}-я`);
  return typo("Генерируется…");
}

export function DeckCard({ deck }: DeckCardProps) {
  const mastery = deck.totalCards > 0 ? deck.masteredCount / deck.totalCards : 0;

  return (
    <Link
      to="/app/decks/$deckId"
      params={{ deckId: deck.id }}
      className="block rounded-2xl bg-card p-5 transition-colors hover:bg-accent"
    >
      <VStack gap="sm">
        <HStack justify="between" align="start" gap="sm">
          <Heading variant="h3" maxLines={2}>
            {typo(deck.title)}
          </Heading>
          {deck.status === "processing" && <Badge variant="muted">{processingLabel(deck.queuePosition)}</Badge>}
          {deck.status === "failed" && <Badge variant="muted">{typo("Ошибка")}</Badge>}
          {deck.status === "ready" && deck.dueCount > 0 && (
            <Badge variant="primary">{typo(`${deck.dueCount} к повторению`)}</Badge>
          )}
        </HStack>
        {deck.description && (
          <Text variant="small" color="supplementary" maxLines={2}>
            {typo(deck.description)}
          </Text>
        )}
        {deck.status === "ready" && (
          <VStack gap="2xs">
            <ProgressBar value={mastery} />
            <HStack justify="between">
              <Text variant="mini" color="supplementary">
                {typo(`Усвоено ${deck.masteredCount} из ${deck.totalCards}`)}
              </Text>
              <Text variant="mini" color="supplementary">
                {`${Math.round(mastery * 100)}%`}
              </Text>
            </HStack>
          </VStack>
        )}
      </VStack>
    </Link>
  );
}
