import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdaptiveGrid, Badge, Heading, HStack, ProgressBar, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { adminQueries, DailyBarChart, formatDateTimeMsk, formatNumber } from "../_lib";

export const Route = createFileRoute("/admin/generation/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminQueries.generation()),
  head: () => ({ meta: [{ title: typo("Генерации — админка") }] }),
  component: AdminGenerationPage,
});

function queueLabel(position: number | null): string {
  if (position === null) return typo("нет в очереди — вероятно, зависла после перезапуска");
  if (position === 0) return typo("генерируется сейчас");
  return typo(`в очереди: ${position}`);
}

function AdminGenerationPage() {
  const { data: generation } = useSuspenseQuery(adminQueries.generation());

  const maxTopCount = Math.max(1, ...generation.topUsers.map((topUser) => topUser.count));

  function renderProcessing() {
    if (!generation.processing.length) {
      return <Text color="supplementary">{typo("Сейчас ничего не генерируется")}</Text>;
    }
    return generation.processing.map((deck) => (
      <HStack key={deck.id} justify="between" align="start" gap="sm" wrap>
        <VStack gap="3xs">
          <Text bold breakWords maxLines={1}>
            {typo(deck.title)}
          </Text>
          <Text variant="small" color="supplementary" breakWords>
            {typo(`${deck.ownerEmail} · создана ${formatDateTimeMsk(deck.createdAt)}`)}
          </Text>
        </VStack>
        <Badge variant={deck.queuePosition === 0 ? "primary" : "muted"}>{queueLabel(deck.queuePosition)}</Badge>
      </HStack>
    ));
  }

  function renderFailed() {
    if (!generation.failed.length) {
      return <Text color="supplementary">{typo("Ошибок генерации нет")}</Text>;
    }
    return generation.failed.map((deck) => (
      <VStack key={deck.id} gap="3xs">
        <HStack justify="between" align="start" gap="sm" wrap>
          <Text bold breakWords maxLines={1}>
            {typo(deck.title)}
          </Text>
          <Text variant="small" color="supplementary">
            {formatDateTimeMsk(deck.failedAt)}
          </Text>
        </HStack>
        <Text variant="small" color="supplementary" breakWords>
          {deck.ownerEmail}
        </Text>
        <Text variant="small" color="destructive" breakWords>
          {deck.error ? typo(deck.error) : typo("Текст ошибки не сохранился")}
        </Text>
      </VStack>
    ));
  }

  function renderTopUsers() {
    if (!generation.topUsers.length) {
      return <Text color="supplementary">{typo("Генераций за 30 дней не было")}</Text>;
    }
    return generation.topUsers.map((topUser) => (
      <VStack key={topUser.userId} gap="3xs">
        <HStack justify="between" align="center" gap="sm">
          <Text variant="small" breakWords maxLines={1}>
            {topUser.email}
          </Text>
          <Text variant="small" bold>
            {formatNumber(topUser.count)}
          </Text>
        </HStack>
        <ProgressBar value={topUser.count / maxTopCount} />
      </VStack>
    ));
  }

  return (
    <VStack gap="xl">
      <Heading variant="h2">{typo("Генерации")}</Heading>

      <SimpleCard title={typo("Сейчас в работе")}>
        <VStack gap="sm">{renderProcessing()}</VStack>
      </SimpleCard>

      <AdaptiveGrid cols={{ base: 1, lg: 2 }} gap="md">
        <DailyBarChart
          title={typo("Генерации за 7 дней")}
          points={generation.generationsDaily}
          formatValue={formatNumber}
        />
        <SimpleCard title={typo("Топ-10 за 30 дней")}>
          <VStack gap="sm">{renderTopUsers()}</VStack>
        </SimpleCard>
      </AdaptiveGrid>

      <SimpleCard title={typo("Последние ошибки")}>
        <VStack gap="md">{renderFailed()}</VStack>
      </SimpleCard>
    </VStack>
  );
}
