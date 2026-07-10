import { Prisma, type PrismaClient } from "@prisma/client";
import webpush from "web-push";

import { serverEnv } from "~/env.server";

// Web-push уведомления (VAPID). Без ключей в env весь слой выключен: UI показывает «скоро»,
// планировщик не стартует, отправка не вызывается.

/** Ключи VAPID заданы — web-push слой включён. */
export function isPushConfigured(): boolean {
  return Boolean(serverEnv.VAPID_PUBLIC_KEY && serverEnv.VAPID_PRIVATE_KEY && serverEnv.VAPID_SUBJECT);
}

// VAPID-параметры выставляются лениво и один раз: env не меняется в рантайме.
let vapidReady = false;

function ensureVapid(): void {
  if (vapidReady) return;
  if (!serverEnv.VAPID_SUBJECT || !serverEnv.VAPID_PUBLIC_KEY || !serverEnv.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(serverEnv.VAPID_SUBJECT, serverEnv.VAPID_PUBLIC_KEY, serverEnv.VAPID_PRIVATE_KEY);
  vapidReady = true;
}

// Протухшая подписка: браузер отписался или переустановлен — запись удаляется.
const GONE_STATUS_CODES = new Set([404, 410]);

function isGoneSubscriptionError(error: unknown): boolean {
  if (!(error instanceof Error) || !("statusCode" in error)) return false;
  return typeof error.statusCode === "number" && GONE_STATUS_CODES.has(error.statusCode);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Куда ведёт клик по уведомлению (путь внутри приложения). */
  url: string;
  /** Вид напоминания — вместе с dayKey даёт дедуп «не чаще раза в день». */
  kind: string;
  /** Календарный день МСК (mskDayKey). */
  dayKey: string;
}

/**
 * Шлёт push всем подпискам пользователя. Дедуп по PushLog (userId, kind, dayKey):
 * запись уже есть — не шлём. Подписки, на которые сервис отвечает 404/410, удаляются.
 * Ошибки доставки не бросаются наружу — только console.error.
 * Возвращает true, если пуш этого вида сегодня ушёл впервые.
 */
export async function sendPushToUser(db: PrismaClient, userId: string, message: PushMessage): Promise<boolean> {
  if (!isPushConfigured()) return false;
  ensureVapid();

  // Guard-запись: уникальный индекс (userId, kind, dayKey) сериализует параллельные прогоны —
  // проигравший получает P2002 и не шлёт дубль.
  try {
    await db.pushLog.create({ data: { userId, kind: message.kind, dayKey: message.dayKey } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url });

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      );
    } catch (error) {
      if (isGoneSubscriptionError(error)) {
        await db.pushSubscription.deleteMany({ where: { id: subscription.id } }).catch(() => undefined);
        continue;
      }
      console.error("push delivery failed:", subscription.endpoint.slice(0, 60), error);
    }
  }
  return true;
}
