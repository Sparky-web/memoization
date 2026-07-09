import { type Prisma, type PrismaClient } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Есть ли у пользователя активный Pro прямо сейчас. Источник правды — сервер.
 * ACTIVE и CANCELED (доступ до конца периода) валидны, пока не истёк currentPeriodEnd;
 * currentPeriodEnd = null — безлимитный Pro (выдаётся только админом), срок не проверяем.
 */
export async function hasActivePro(db: PrismaClient, userId: string, now: Date = new Date()): Promise<boolean> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  if (!subscription) return false;
  if (subscription.status === "EXPIRED") return false;
  if (!subscription.currentPeriodEnd) return true;
  return subscription.currentPeriodEnd > now;
}

/**
 * Отзывает у подписки дни возвращённого платежа: currentPeriodEnd уменьшается на periodDays
 * с клампом к «сейчас»; periodDays неизвестен (старые записи) — безопасный фолбэк: подписка
 * гасится целиком. Безлимитную подписку (currentPeriodEnd = null) возврат не трогает —
 * она выдана админом, а не куплена этим платежом.
 */
export async function shrinkSubscriptionAfterRefund(
  tx: Prisma.TransactionClient,
  userId: string,
  periodDays: number | null,
  now: Date,
): Promise<void> {
  const subscription = await tx.subscription.findUnique({ where: { userId } });
  if (!subscription?.currentPeriodEnd) return;
  const reducedEnd = periodDays ? new Date(subscription.currentPeriodEnd.getTime() - periodDays * DAY_MS) : now;
  await tx.subscription.update({
    where: { userId },
    data: reducedEnd > now ? { currentPeriodEnd: reducedEnd } : { status: "EXPIRED", currentPeriodEnd: now },
  });
}
