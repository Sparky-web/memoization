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

/** Компенсация: генерация упала — возвращаем списанные попытки (удаляем события по refId). */
export async function refundUsage(db: PrismaClient, kind: UsageKind, refIds: readonly string[]): Promise<void> {
  if (!refIds.length) return;
  await db.usageEvent.deleteMany({ where: { kind, refId: { in: [...refIds] } } });
}
