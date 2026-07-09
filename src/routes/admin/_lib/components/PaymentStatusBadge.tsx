import { Badge } from "~/components";
import { typo } from "~/lib";

import { type AdminPaymentItem } from "../model/adminQueries";

type BadgeVariant = "default" | "primary" | "muted" | "outline";

const STATUS_VIEWS: Record<AdminPaymentItem["status"], { label: string; variant: BadgeVariant }> = {
  PENDING: { label: typo("Ожидает"), variant: "outline" },
  SUCCEEDED: { label: typo("Успешен"), variant: "primary" },
  CANCELED: { label: typo("Отменён"), variant: "muted" },
  REFUNDED: { label: typo("Возврат"), variant: "default" },
};

/** Цветной бейдж статуса платежа — общий для списка платежей и раскрытой карточки пользователя. */
export function PaymentStatusBadge({ status }: { status: AdminPaymentItem["status"] }) {
  const view = STATUS_VIEWS[status];
  return <Badge variant={view.variant}>{view.label}</Badge>;
}
