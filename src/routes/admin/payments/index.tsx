import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdaptiveGrid, Heading, Stat, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AdminPaymentCard, adminQueries, formatNumber, formatRub, ListSkeleton, LoadMoreSentinel } from "../_lib";

export const Route = createFileRoute("/admin/payments/")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(adminQueries.payments()),
  head: () => ({ meta: [{ title: typo("Платежи — админка") }] }),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  const paymentsQuery = useInfiniteQuery(adminQueries.payments());

  const pages = paymentsQuery.data?.pages ?? [];
  const payments = pages.flatMap((page) => page.payments);
  const totals = pages[0]?.totals ?? null;

  function renderList() {
    if (paymentsQuery.isLoading) {
      return <ListSkeleton />;
    }
    if (!payments.length) {
      return <Text color="supplementary">{typo("Платежей пока нет")}</Text>;
    }
    return (
      <VStack gap="sm">
        {payments.map((payment) => (
          <AdminPaymentCard key={payment.id} payment={payment} />
        ))}
        {paymentsQuery.isFetchingNextPage && <ListSkeleton rows={1} />}
        {paymentsQuery.hasNextPage && (
          <LoadMoreSentinel
            onVisible={() => {
              if (paymentsQuery.hasNextPage && !paymentsQuery.isFetchingNextPage) {
                void paymentsQuery.fetchNextPage();
              }
            }}
          />
        )}
      </VStack>
    );
  }

  return (
    <VStack gap="xl">
      <Heading variant="h2">{typo("Платежи")}</Heading>

      {totals && (
        <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="sm">
          <Stat
            label={typo(`Успешных: ${formatNumber(totals.succeededCount)}`)}
            value={formatRub(totals.succeededKopecks)}
          />
          <Stat
            label={typo(`Возвратов: ${formatNumber(totals.refundedCount)}`)}
            value={formatRub(totals.refundedKopecks)}
          />
          <Stat label={typo("Ожидают оплаты")} value={formatNumber(totals.pendingCount)} />
        </AdaptiveGrid>
      )}

      {renderList()}
    </VStack>
  );
}
