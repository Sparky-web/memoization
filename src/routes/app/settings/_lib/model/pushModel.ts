import { queryOptions } from "@tanstack/react-query";

import { getPushStatus, removePushSubscription, savePushSubscription, sendTestPush } from "~/server/fn/push";

import { urlBase64ToUint8Array } from "../lib/vapid";

// Push-напоминания в настройках: статус, включение (разрешение → регистрация СВ → подписка)
// и отключение. Регистрация service worker'а происходит ТОЛЬКО здесь — по действию пользователя.

// Свой scope: /sw.js (PWA) уже держит scope «/», второй воркер на том же scope вытеснил бы его.
const PUSH_SW_URL = "/push-sw.js";
const PUSH_SW_SCOPE = "/push/";

export const pushQueries = {
  status: () =>
    queryOptions({
      queryKey: ["push", "status"],
      queryFn: () => getPushStatus(),
    }),
};

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// pushManager.subscribe требует активный воркер; свежая регистрация может быть ещё в installing.
async function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker || worker.state === "activated") return;
  await new Promise<void>((resolve) => {
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
  });
}

/**
 * Включает напоминания: разрешение на уведомления → регистрация push-воркера → подписка →
 * сохранение на сервере. Бросает Error с кодом UNSUPPORTED / PERMISSION_DENIED / SUBSCRIBE_FAILED.
 */
export async function enablePushNotifications(publicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error("UNSUPPORTED");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("PERMISSION_DENIED");

  const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE });
  await waitForActivation(registration);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const keys = subscription.toJSON().keys;
  const p256dh = keys?.p256dh;
  const authKey = keys?.auth;
  if (!p256dh || !authKey) {
    await subscription.unsubscribe().catch(() => undefined);
    throw new Error("SUBSCRIBE_FAILED");
  }

  await savePushSubscription({
    data: { endpoint: subscription.endpoint, p256dh, auth: authKey, userAgent: navigator.userAgent.slice(0, 500) },
  });
}

/** Шлёт тестовое уведомление на все устройства пользователя (для самопроверки). */
export async function sendTestPushNotification(): Promise<void> {
  await sendTestPush();
}

/** Отключает напоминания на ЭТОМ устройстве. Возвращает false, если локальной подписки не было. */
export async function disablePushNotifications(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  await removePushSubscription({ data: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe().catch(() => undefined);
  return true;
}
