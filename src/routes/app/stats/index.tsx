import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdaptiveGrid, Heading, Stat, VStack } from "~/components";
import { typo } from "~/lib";

import { ActivityChart } from "./_lib/components/ActivityChart";
import { statsQueries } from "./_lib/model/statsQueries";

export const Route = createFileRoute("/app/stats/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQueries.overall()),
  head: () => ({ meta: [{ title: typo("Статистика") }] }),
  component: StatsPage,
});

function StatsPage() {
  const { data: stats } = useSuspenseQuery(statsQueries.overall());
  const accuracy = Math.round(stats.accuracy * 100);

  return (
    <VStack gap="xl">
      <Heading variant="h1">{typo("Статистика")}</Heading>

      <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
        <Stat label={typo("Колод")} value={stats.totalDecks} />
        <Stat label={typo("Карточек")} value={stats.totalCards} />
        <Stat label={typo("Усвоено")} value={stats.masteredCards} />
        <Stat label={typo("К повторению")} value={stats.dueCards} />
      </AdaptiveGrid>

      <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="sm">
        <Stat label={typo("Повторений сегодня")} value={stats.reviewsToday} />
        <Stat
          label={typo("Точность")}
          value={`${accuracy}%`}
          hint={typo(`Всего повторений: ${stats.totalReviews}`)}
        />
        <Stat label={typo("Серия дней")} value={stats.streakDays} hint={typo("дней подряд с повторениями")} />
      </AdaptiveGrid>

      <ActivityChart points={stats.activity} />
    </VStack>
  );
}
