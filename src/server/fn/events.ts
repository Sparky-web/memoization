import { createServerFn } from "@tanstack/react-start";

import { zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

/**
 * Продуктовая аналитика с клиента: только whitelist имён, meta — плоская запись строк.
 * Ошибки записи глотаются — аналитика не должна ломать UX.
 */
export const logEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    zodRussian.object({
      name: zodRussian.enum(["paywall_shown", "pricing_viewed"]),
      meta: zodRussian.record(zodRussian.string(), zodRussian.string()).optional(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    try {
      await context.db.analyticsEvent.create({
        data: { name: input.name, meta: input.meta, userId: context.session.user.id },
      });
    } catch (error) {
      console.error("Не удалось записать событие аналитики", error);
    }
    return true;
  });
