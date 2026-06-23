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

// Аналогично — прерванная генерация заданий/тестов.
void db.deck
  .updateMany({
    where: { exercisesStatus: "processing" },
    data: { exercisesStatus: "failed", exercisesError: typo("Генерация заданий прервана перезапуском сервера") },
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
