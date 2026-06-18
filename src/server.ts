import "./instrument.server";

import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

import { typo } from "~/lib";
import { db } from "~/server/db";

// При старте контейнера сбрасываем «зависшие» генерации (claude-задание прервано рестартом).
void db.deck
  .updateMany({
    where: { status: "processing" },
    data: { status: "failed", generationError: typo("Генерация прервана перезапуском сервера") },
  })
  .catch(() => undefined);

const fetch = createStartHandler(defaultStreamHandler);

export default createServerEntry(
  wrapFetchWithSentry({
    fetch(request: Request) {
      return fetch(request);
    },
  }),
);
