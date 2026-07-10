import { type PrismaClient } from "@prisma/client";
import { setResponseStatus } from "@tanstack/react-start/server";

import { FREE_CHAT_PER_DAY, PAYWALL_ERRORS, PRO_CHAT_PER_DAY, startOfDayMsk, typo } from "~/lib";

import { hasActivePro } from "./entitlement";

// Учёт использования платных ИИ-функций: лимиты Free (за всё время) и fair-use Pro (за день МСК)
// считаются по строкам UsageEvent. Запись — только после успешной постановки/ответа.

/**
 * Вид события использования: генерация экзамена (имя историческое), перегенерация карточек
 * вопроса, сообщение чата (общая квота чата, «объясни ученику/почему», черновиков карт
 * и образов дворца), ИИ-сверка открытого ответа (отдельная квота — сверки идут в каждой
 * сессии и не должны съедать разговорный лимит), голосовой вызов SpeechKit (STT/TTS),
 * разбор файла с вопросами (мастер, 10/день всем тарифам).
 */
export type UsageKind =
  | "deck_generation"
  | "card_regeneration"
  | "chat_message"
  | "ai_check"
  | "speech"
  | "question_parse";

/** Сколько событий вида kind за текущий календарный день МСК (дневные лимиты). */
export function countUsageToday(db: PrismaClient, userId: string, kind: UsageKind): Promise<number> {
  return db.usageEvent.count({ where: { userId, kind, createdAt: { gte: startOfDayMsk(new Date()) } } });
}

/**
 * Гейт общей разговорной квоты chat_message (чат по карточке, «объясни ученику/почему»,
 * черновики карт, образы дворца): Free — пейвол-код 402, Pro — человеческий текст fair-use.
 * Возвращает признак Pro — вызывающие переиспользуют его, чтобы не ходить в БД дважды.
 */
export async function assertChatQuota(db: PrismaClient, userId: string): Promise<boolean> {
  const pro = await hasActivePro(db, userId);
  const usedToday = await countUsageToday(db, userId, "chat_message");
  if (!pro && usedToday >= FREE_CHAT_PER_DAY) {
    setResponseStatus(402);
    throw new Error(PAYWALL_ERRORS.CHAT);
  }
  if (pro && usedToday >= PRO_CHAT_PER_DAY) {
    setResponseStatus(402);
    throw new Error(typo("Дневной fair-use лимит сообщений исчерпан — продолжите завтра"));
  }
  return pro;
}

/** Списывает попытку. refId: id экзамена для генераций (по нему компенсация), id карточки для чата. */
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
    // ::text — pg_advisory_xact_lock возвращает void, который Prisma не умеет десериализовать.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.userId}:${input.kind}`}, 0))::text`;
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
    // Удаляем только последнее событие: у экзамена могла накопиться история успешных
    // перегенераций (Pro), их учёт возврат текущей неудачи затрагивать не должен.
    const lastEvent = await db.usageEvent.findFirst({
      where: { kind, refId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (lastEvent) await db.usageEvent.deleteMany({ where: { id: lastEvent.id } });
  }
}
