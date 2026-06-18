import * as Sentry from "@sentry/tanstackstart-react";

// Серверный Sentry-инициализатор: импортируется первым в src/server.ts.
// DSN читается напрямую из process.env, чтобы не тянуть env-валидацию
// до того, как поднимется приложение.
const dsn = process.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    // console.error и console.warn считаем ошибками — улетают в Sentry
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error", "warn"] })],
    beforeSend(event) {
      const text = event.message ?? event.logentry?.message ?? "";
      if (typeof text === "string" && text.includes("%c")) return null;
      return event;
    },
  });
}
