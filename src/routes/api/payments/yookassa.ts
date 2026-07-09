import { createFileRoute } from "@tanstack/react-router";

import { handleYookassaWebhook } from "~/server/yookassaWebhook";

export const Route = createFileRoute("/api/payments/yookassa")({
  server: {
    handlers: {
      POST: ({ request }) => handleYookassaWebhook(request),
    },
  },
});
