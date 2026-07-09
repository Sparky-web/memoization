import { type PrismaClient } from "@prisma/client";

/**
 * Есть ли у пользователя активный Pro прямо сейчас. Источник правды — сервер.
 * ACTIVE и CANCELED (доступ до конца периода) валидны, пока не истёк currentPeriodEnd.
 */
export async function hasActivePro(db: PrismaClient, userId: string, now: Date = new Date()): Promise<boolean> {
  const subscription = await db.subscription.findUnique({ where: { userId } });
  if (!subscription) return false;
  if (subscription.status === "EXPIRED") return false;
  return subscription.currentPeriodEnd > now;
}
