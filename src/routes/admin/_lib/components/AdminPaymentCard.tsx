import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, ConfirmDialog, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { formatDateTimeMsk, formatDays, formatRub } from "../lib/format";
import { refundPayment } from "../model/adminMutations";
import { type AdminPaymentItem } from "../model/adminQueries";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

function planLine(payment: AdminPaymentItem): string {
  if (payment.periodDays === null) return typo("Pro");
  return typo(`Pro на ${formatDays(payment.periodDays)}`);
}

/** Строка платежа: сумма, статус, покупатель, копируемый id ЮKassa и возврат с подтверждением. */
export function AdminPaymentCard({ payment }: { payment: AdminPaymentItem }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const refundMutation = useMutation({
    mutationFn: () => refundPayment({ data: { paymentId: payment.id } }),
    onSuccess: () => {
      toast.success(typo("Возврат выполнен, Pro отключён"));
      setConfirming(false);
      // Возврат меняет платежи, пользователя и метрики — сбрасываем весь админ-кэш.
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message || typo("Не удалось выполнить возврат"));
    },
  });

  const copyProviderId = () => {
    void navigator.clipboard.writeText(payment.providerPaymentId).then(
      () => toast.success(typo("Идентификатор скопирован")),
      () => toast.error(typo("Не удалось скопировать")),
    );
  };

  const canRefund = payment.status === "SUCCEEDED" && payment.provider === "YOOKASSA";

  return (
    <SimpleCard>
      <VStack gap="xs">
        <HStack justify="between" align="start" gap="sm" wrap>
          <VStack gap="3xs">
            <HStack gap="xs" align="center" wrap>
              <Text bold>{formatRub(payment.amount)}</Text>
              <PaymentStatusBadge status={payment.status} />
            </HStack>
            <Text variant="small" color="supplementary" breakWords>
              {payment.userEmail}
            </Text>
            <Text variant="small" color="supplementary">
              {typo(`${formatDateTimeMsk(payment.createdAt)} · ${planLine(payment)}`)}
            </Text>
          </VStack>

          {canRefund && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {typo("Вернуть платёж")}
            </Button>
          )}
        </HStack>

        <button
          type="button"
          className="flex w-fit cursor-pointer items-center gap-2 text-left"
          title={typo("Скопировать идентификатор платежа")}
          onClick={copyProviderId}
        >
          <Text variant="code" breakWords>
            {payment.providerPaymentId}
          </Text>
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </VStack>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={typo("Вернуть платёж?")}
        description={typo(
          `Полный возврат ${formatRub(payment.amount)} пользователю ${payment.userEmail}. Pro будет отключён сразу. Действие необратимо.`,
        )}
        confirmLabel={typo("Да, вернуть платёж")}
        confirmPending={refundMutation.isPending}
        onConfirm={() => {
          refundMutation.mutate();
        }}
      />
    </SimpleCard>
  );
}
