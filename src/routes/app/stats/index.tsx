import { createFileRoute } from "@tanstack/react-router";

import { AdaptiveGrid, Heading, HStack, SimpleCard, Stat, Text, VStack } from "~/components";
import { typo } from "~/lib";
import { getOverallStats } from "~/server/fn/stats";

// Временная сводка волны 1: активность, серия, готовности. Полная аналитика
// (калибровка уверенности, слабые темы, прогноз-против-факта) — волна 4.

export const Route = createFileRoute("/app/stats/")({
  loader: () => getOverallStats(),
  head: () => ({ meta: [{ title: typo("Статистика") }] }),
  component: StatsPage,
});

function StatsPage() {
  const stats = Route.useLoaderData();

  return (
    <VStack gap="xl">
      <Heading variant="h1">{typo("Статистика")}</Heading>

      <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
        <Stat label={typo("Экзаменов")} value={stats.totalExams} />
        <Stat label={typo("Карточек")} value={stats.totalCards} />
        <Stat label={typo("Ответов всего")} value={stats.totalReviews} />
        <Stat label={typo("Точность")} value={`${Math.round(stats.accuracy * 100)}%`} />
      </AdaptiveGrid>

      <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
        <Stat label={typo("Серия")} value={stats.streakDays} hint={typo("дней подряд")} />
        <Stat label={typo("Сегодня")} value={stats.reviewsToday} hint={typo("ответов")} />
      </AdaptiveGrid>

      <SimpleCard title={typo("Активность за 14 дней")}>
        <VStack gap="2xs">
          {stats.activity.map((point) => (
            <HStack key={point.date} justify="between" gap="sm">
              <Text variant="small" color="supplementary">
                {point.date}
              </Text>
              <Text variant="small" bold>
                {point.count}
              </Text>
            </HStack>
          ))}
        </VStack>
      </SimpleCard>

      {stats.exams.length > 0 && (
        <SimpleCard title={typo("Готовность по экзаменам")}>
          <VStack gap="2xs">
            {stats.exams.map((exam) => (
              <HStack key={exam.examId} justify="between" gap="sm" wrap>
                <Text variant="small" breakWords>
                  {typo(exam.title)}
                  {exam.archived ? typo(" · в архиве") : ""}
                </Text>
                <Text variant="small" bold>
                  {`${Math.round(exam.readiness * 100)}%`}
                </Text>
              </HStack>
            ))}
          </VStack>
        </SimpleCard>
      )}
    </VStack>
  );
}
