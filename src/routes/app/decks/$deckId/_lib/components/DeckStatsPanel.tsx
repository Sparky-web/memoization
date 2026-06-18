import { AdaptiveGrid, ProgressBar, Stat, VStack } from "~/components";
import { typo } from "~/lib";

import type { DeckStats } from "../model/deckQueries";

interface DeckStatsPanelProps {
  stats: DeckStats;
}

export function DeckStatsPanel({ stats }: DeckStatsPanelProps) {
  const mastery = stats.totalCards > 0 ? stats.masteredCards / stats.totalCards : 0;

  return (
    <VStack gap="sm">
      <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
        <Stat label={typo("Новые")} value={stats.newCards} />
        <Stat label={typo("На изучении")} value={stats.learningCards} />
        <Stat label={typo("Усвоено")} value={stats.masteredCards} />
        <Stat
          label={typo("Точность")}
          value={`${Math.round(stats.accuracy * 100)}%`}
          hint={typo(`Повторений: ${stats.totalReviews}`)}
        />
      </AdaptiveGrid>
      <ProgressBar value={mastery} />
    </VStack>
  );
}
