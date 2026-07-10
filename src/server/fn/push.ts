import { createServerFn } from "@tanstack/react-start";

import { serverEnv } from "~/env.server";
import { zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";
import { isPushConfigured } from "~/server/push";

// Подписки на push-напоминания: статус для секции настроек, сохранение и удаление подписки.
// Сама отправка — src/server/push.ts, расписание — src/server/pushJobs.ts.

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
