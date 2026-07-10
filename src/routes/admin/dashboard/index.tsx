import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdaptiveGrid, Heading, SimpleCard, Stat, VStack } from "~/components";
import { typo } from "~/lib";

import { adminQueries, DailyBarChart, formatNumber, formatRub, FunnelChart } from "../_lib";

export const Route = createFileRoute("/admin/dashboard/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminQueries.dashboard()),
  head: () => ({ meta: [{ title: typo("Метрики — админка") }] }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { data: dashboard } = useSuspenseQuery(adminQueries.dashboard());

  const funnelSteps = [
    { label: typo("Показан пейвол"), count: dashboard.funnel.paywallShown },
    { label: typo("Открыт прайсинг"), count: dashboard.funnel.pricingViewed },
    { label: typo("Начат чекаут"), count: dashboard.funnel.checkoutStarted },
    { label: typo("Оплата прошла"), count: dashboard.funnel.paymentSucceeded },
  ];

  return (
    <VStack gap="xl">
      <Heading variant="h2">{typo("Метрики")}</Heading>

      <AdaptiveGrid cols={{ base: 2, md: 3, xl: 5 }} gap="sm">
        <Stat label={typo("Пользователей")} value={formatNumber(dashboard.totals.usersTotal)} />
        <Stat label={typo("Новых за 7 дней")} value={formatNumber(dashboard.totals.usersNew7d)} />
        <Stat label={typo("Активных Pro")} value={formatNumber(dashboard.totals.activePro)} />
        <Stat label={typo("Выручка за 30 дней")} value={formatRub(dashboard.totals.revenue30dKopecks)} />
        <Stat label={typo("Выручка всего")} value={formatRub(dashboard.totals.revenueTotalKopecks)} />
      </AdaptiveGrid>

      <AdaptiveGrid cols={{ base: 1, lg: 2 }} gap="md">
        <DailyBarChart
          title={typo("Регистрации за 30 дней")}
          points={dashboard.registrationsDaily}
          formatValue={formatNumber}
        />
        <DailyBarChart
          title={typo("Выручка за 30 дней")}
          points={dashboard.revenueDailyKopecks}
          formatValue={formatRub}
        />
        <DailyBarChart title={typo("Ответы за 30 дней")} points={dashboard.reviewsDaily} formatValue={formatNumber} />
        <DailyBarChart
          title={typo("ИИ-генерации за 30 дней")}
          points={dashboard.generationsDaily}
          formatValue={formatNumber}
        />
      </AdaptiveGrid>

      <SimpleCard title={typo("Воронка конверсии за 30 дней")}>
        <FunnelChart steps={funnelSteps} />
      </SimpleCard>
    </VStack>
  );
}
