import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { serverEnv } from "~/env.server";
import { mskDayKey, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";
import { isPushConfigured, PUSH_TEST_KIND, sendPushToUser } from "~/server/push";

// Подписки на push-напоминания: статус для секции настроек, сохранение и удаление подписки,
// тестовая отправка для самопроверки. Сама отправка — src/server/push.ts, расписание — pushJobs.ts.

export const getPushStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const configured = isPushConfigured();
    const subscriptionCount = configured
      ? await context.db.pushSubscription.count({ where: { userId: context.session.user.id } })
      : 0;
    return {
      configured,
      // Публичный VAPID-ключ — он и должен быть у клиента (applicationServerKey подписки).
      publicKey: configured ? (serverEnv.VAPID_PUBLIC_KEY ?? null) : null,
      subscribed: subscriptionCount > 0,
    };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      endpoint: zodRussian.url().max(2000),
      p256dh: zodRussian.string().min(1).max(500),
      auth: zodRussian.string().min(1).max(500),
      userAgent: zodRussian.string().max(500).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    // Endpoint уникален глобально: браузер переподписался или сменился владелец аккаунта
    // в том же браузере — запись переезжает на текущего пользователя.
    await context.db.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        userId: context.session.user.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
      },
      update: {
        userId: context.session.user.id,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent ?? null,
      },
    });
    return true;
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ endpoint: zodRussian.string().max(2000) }))
  .handler(async ({ data, context }) => {
    await context.db.pushSubscription.deleteMany({
      where: { endpoint: data.endpoint, userId: context.session.user.id },
    });
    return true;
  });

// Тестовое уведомление на свои устройства: kind="test" идёт мимо дедупа PushLog —
// самопроверку можно повторять сколько угодно. Требует активной подписки и настроенного VAPID.
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!isPushConfigured()) {
      setResponseStatus(503);
      throw new Error(typo("Push-уведомления не настроены на сервере"));
    }
    const userId = context.session.user.id;
    const subscriptionCount = await context.db.pushSubscription.count({ where: { userId } });
    if (!subscriptionCount) {
      setResponseStatus(409);
      throw new Error(typo("Сначала включите напоминания на этом устройстве"));
    }
    await sendPushToUser(context.db, userId, {
      kind: PUSH_TEST_KIND,
      dayKey: mskDayKey(new Date()),
      title: typo("Тест уведомлений Домашника"),
      body: typo("Если видишь это — всё работает 🎉"),
      url: "/app",
    });
    return true;
  });
