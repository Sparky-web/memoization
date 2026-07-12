import "./instrument.server";

import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";

import { typo } from "~/lib";
import { ensureBootstrapAdmins } from "~/server/adminBootstrap";
import { db } from "~/server/db";
import { ensurePushJobs } from "~/server/pushJobs";
import { refundUsage } from "~/server/usage";

// Владелец получает роль администратора при старте контейнера (если аккаунт уже существует)
void ensureBootstrapAdmins(db);

// Планировщик push-напоминаний (идемпотентный; без VAPID-ключей — no-op)
ensurePushJobs();

// При старте контейнера сбрасываем «зависшие» генерации (ИИ-задание прервано рестартом)
// и возвращаем списанные попытки — прерванная рестартом генерация не должна сжигать лимит.
void db.exam
  .findMany({ where: { status: "processing" }, select: { id: true } })
  .then(async (stuckExams) => {
    if (!stuckExams.length) return;
    const stuckIds = stuckExams.map((exam) => exam.id);
    await db.exam.updateMany({
      where: { id: { in: stuckIds } },
      data: { status: "failed", generationError: typo("Генерация прервана перезапуском сервера") },
    });
    await refundUsage(db, "deck_generation", stuckIds);
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
