import { type PrismaClient } from "@prisma/client";

import { startOfDayMsk } from "~/lib";

// Учёт использования платных ИИ-функций: лимиты Free (за всё время) и fair-use Pro (за день МСК)
// считаются по строкам UsageEvent. Запись — только после успешной постановки/ответа.

/** Вид события использования: генерация колоды, генерация заданий, сообщение чата. */
export type UsageKind = "deck_generation" | "exercise_generation" | "chat_message";

/** Сколько событий вида kind у пользователя за всё время (лимиты Free «всего, не в день»). */
export function countUsageTotal(db: PrismaClient, userId: string, kind: UsageKind): Promise<number> {
  return db.usageEvent.count({ where: { userId, kind } });
}

/** Сколько событий вида kind за текущий календарный день МСК (дневные лимиты). */
export function countUsageToday(db: PrismaClient, userId: string, kind: UsageKind): Promise<number> {
  return db.usageEvent.count({ where: { userId, kind, createdAt: { gte: startOfDayMsk(new Date()) } } });
}

/** Списывает попытку. refId: id колоды для генераций (по нему компенсация), id карточки для чата. */
export async function recordUsage(db: PrismaClient, userId: string, kind: UsageKind, refId: string): Promise<void> {
  await db.usageEvent.create({ data: { userId, kind, refId } });
}

/**
 * Атомарное списание с проверкой лимита: подсчёт и запись события идут в одной транзакции
 * под advisory-локом по паре (пользователь, вид), поэтому параллельные запросы сериализуются
 * и не обходят лимит гонкой «прочитали count → записали событие». since задаёт окно дневных
 * лимитов; без него лимит считается за всё время. Возвращает false, если лимит уже исчерпан.
 */
export function tryChargeUsage(
  db: PrismaClient,
  input: { userId: string; kind: UsageKind; refId: string; limit: number; since?: Date },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.kind}`}, 0))`;
    const used = await tx.usageEvent.count({
      where: {
        userId: input.userId,
        kind: input.kind,
        ...(input.since ? { createdAt: { gte: input.since } } : {}),
      },
    });
    if (used >= input.limit) return false;
    await tx.usageEvent.create({ data: { userId: input.userId, kind: input.kind, refId: input.refId } });
    return true;
  });
}

/** Компенсация: генерация упала — возвращаем по одной списанной попытке на каждый refId. */
export async function refundUsage(db: PrismaClient, kind: UsageKind, refIds: readonly string[]): Promise<void> {
  for (const refId of refIds) {
    // Удаляем только последнее событие: у колоды могла накопиться история успешных
    // перегенераций (Pro), их учёт возврат текущей неудачи затрагивать не должен.
    const lastEvent = await db.usageEvent.findFirst({
      where: { kind, refId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lastEvent) await db.usageEvent.deleteMany({ where: { id: lastEvent.id } });
  }
}
