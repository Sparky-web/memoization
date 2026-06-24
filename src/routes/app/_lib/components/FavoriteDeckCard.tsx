import { Link } from "@tanstack/react-router";

import { Badge, Heading, HStack, ProgressBar, Text, VStack } from "~/components";
import { typo } from "~/lib";

import type { FavoriteDeckItem } from "../model/dashboardQueries";

interface FavoriteDeckCardProps {
  deck: FavoriteDeckItem;
}

// Карточка избранной (чужой) колоды на дашборде: показывает автора и личный прогресс пользователя.
export function FavoriteDeckCard({ deck }: FavoriteDeckCardProps) {
  const mastery = deck.totalCards > 0 ? deck.masteredCount / deck.totalCards : 0;

  return (
    <Link
      to="/app/decks/$deckId"
      params={{ deckId: deck.id }}
      className="bg-card hover:bg-accent block rounded-2xl p-5 transition-colors"
    >
      <VStack gap="sm">
        <HStack justify="between" align="start" gap="sm">
          <Heading variant="h3" maxLines={2}>
            {typo(deck.title)}
          </Heading>
          {deck.dueCount > 0 && <Badge variant="primary">{typo(`${deck.dueCount} к повторению`)}</Badge>}
        </HStack>
        <Text variant="mini" color="supplementary">
          {deck.authorName ? typo(`Автор: ${deck.authorName}`) : typo("Чужая колода")}
        </Text>
        {deck.description && (
          <Text variant="small" color="supplementary" maxLines={2}>
            {typo(deck.description)}
          </Text>
        )}
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
      </VStack>
    </Link>
  );
}
