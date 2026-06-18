import * as Sentry from "@sentry/tanstackstart-react";

import { clientEnv } from "~/env-client";

if (clientEnv.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: clientEnv.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // console.error и console.warn считаем ошибками — улетают в Sentry
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error", "warn"] })],
    ignoreErrors: ["ResizeObserver loop", "Non-Error promise rejection captured", /Failed to fetch/i],
    beforeSend(event) {
      // Отсекаем стилизованные логи dev-логгеров: их текст уникален для каждого
      // вызова и не группируется. Признак — CSS-директива %c.
      const text = event.message ?? event.logentry?.message ?? "";
      if (typeof text === "string" && text.includes("%c")) return null;
      return event;
    },
  });
}
