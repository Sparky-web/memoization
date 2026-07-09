import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, HStack, SimpleCard, Text, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";

import { formatDateTimeMsk, formatDays, formatRub } from "../lib/format";
import { refundGenerationUsage } from "../model/adminMutations";
import { adminQueries, type AdminUserItem } from "../model/adminQueries";
import { ManageSubscriptionDialog } from "./ManageSubscriptionDialog";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

/** Бейдж подписки: активный Pro (с датой конца или бессрочный) или Free. */
function SubscriptionBadge({ user }: { user: AdminUserItem }) {
  if (user.proUnlimited) {
    return <Badge variant="primary">{typo("Pro · бессрочно")}</Badge>;
  }
  if (!user.proUntil) {
    return <Badge variant="muted">Free</Badge>;
  }
  return <Badge variant="primary">{typo(`Pro до ${formatDateRuMsk(user.proUntil)}`)}</Badge>;
}

function activityLine(user: AdminUserItem): string {
  if (!user.lastReviewAt) return typo("повторений ещё не было");
  return typo(`последняя активность ${formatDateTimeMsk(user.lastReviewAt)}`);
}

/** Карточка пользователя: метрики, подписка; раскрытие — платежи и ручное управление. */
export function AdminUserCard({ user }: { user: AdminUserItem }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const paymentsQuery = useQuery({ ...adminQueries.userPayments(user.id), enabled: open });

  const refundUsageMutation = useMutation({
    mutationFn: () => refundGenerationUsage({ data: { userId: user.id } }),
    onSuccess: (result) => {
      toast.success(typo(`Попытка возвращена. Использовано генераций: ${result.remainingUsed}`));
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось вернуть попытку"));
    },
  });

  const payments = paymentsQuery.data ?? [];

  function renderPayments() {
    if (paymentsQuery.isLoading) {
      return <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />;
    }
    if (!payments.length) {
      return (
        <Text variant="small" color="supplementary">
          {typo("Платежей нет")}
        </Text>
      );
    }
    return payments.map((payment) => (
      <HStack key={payment.id} gap="sm" align="center" wrap>
        <Text variant="small" color="supplementary">
          {formatDateTimeMsk(payment.createdAt)}
        </Text>
        <Text variant="small" bold>
          {formatRub(payment.amount)}
        </Text>
        {payment.periodDays !== null && (
          <Text variant="small" color="supplementary">
            {formatDays(payment.periodDays)}
          </Text>
        )}
        <PaymentStatusBadge status={payment.status} />
      </HStack>
    ));
  }

  return (
    <SimpleCard>
      <VStack gap="sm">
        <HStack justify="between" align="start" gap="sm" wrap>
          <VStack gap="3xs">
            <HStack gap="xs" align="center" wrap>
              <Text bold breakWords>
                {user.email}
              </Text>
              {user.role === "admin" && <Badge variant="outline">{typo("админ")}</Badge>}
              <SubscriptionBadge user={user} />
            </HStack>
            {user.name && (
              <Text variant="small" color="supplementary" breakWords>
                {typo(user.name)}
              </Text>
            )}
            <Text variant="small" color="supplementary">
              {typo(
                `регистрация ${formatDateRuMsk(user.createdAt)} · колод ${user.deckCount} · карточек ${user.cardCount} · повторений ${user.reviewCount} · генераций ${user.generationsUsed}`,
              )}
            </Text>
            <Text variant="small" color="supplementary">
              {activityLine(user)}
            </Text>
          </VStack>

          <Button
            variant="link"
            size="inline"
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            {open ? typo("Свернуть") : typo("Подробнее")}
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </HStack>

        {open && (
          <VStack gap="sm" className="border-t border-border pt-3">
            <HStack gap="sm" wrap>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setManaging(true);
                }}
              >
                {typo("Управлять подпиской")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={refundUsageMutation.isPending || !user.generationsUsed}
                onClick={() => {
                  refundUsageMutation.mutate();
                }}
              >
                {typo("Вернуть попытку генерации")}
              </Button>
            </HStack>

            <VStack gap="2xs">
              <Text variant="mini" color="supplementary" bold>
                {typo("Последние платежи")}
              </Text>
              {renderPayments()}
            </VStack>
          </VStack>
        )}
      </VStack>

      {managing && (
        <ManageSubscriptionDialog
          user={user}
          onClose={() => {
            setManaging(false);
          }}
        />
      )}
    </SimpleCard>
  );
}
