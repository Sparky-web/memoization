import { type Prisma } from "@prisma/client";
import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { startOfDayMsk, typo, zodRussian } from "~/lib";
import { getGenerationQueuePosition } from "~/server/generation";
import { adminMiddleware, authMiddleware } from "~/server/middleware";
import { createRefund, isYookassaConfigured } from "~/server/yookassa";

// Админка: метрики, пользователи, платежи с возвратами и мониторинг ИИ-генераций.
// Все функции, кроме getAdminAccess, — под adminMiddleware (роль проверяется по БД).

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;

// Ключ календарного дня МСК (как в fn/stats.ts): графики считаем по местным дням, не по UTC.
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" });

function dayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

/** Начало окна «последние days дней, включая сегодня» по московскому календарю. */
function sinceDays(days: number): Date {
  return startOfDayMsk(new Date(Date.now() - (days - 1) * DAY_MS));
}

/** Ряд по дням за days дней до сегодня включительно; дни без событий — нули. */
function buildDailySeries(rows: { at: Date; weight: number }[], days: number): { date: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.at);
    sums.set(key, (sums.get(key) ?? 0) + row.weight);
  }
  const series: { date: string; value: number }[] = [];
  const now = Date.now();
  for (let offset = days - 1; offset >= 0; offset--) {
    const key = dayKey(new Date(now - offset * DAY_MS));
    series.push({ date: key, value: sums.get(key) ?? 0 });
  }
  return series;
}

/** Флаг «текущий пользователь — админ» для guard'а роутов и пункта меню. Роль — из БД, не из сессии. */
export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const user = await context.db.user.findUnique({
      where: { id: context.session.user.id },
      select: { role: true },
    });
    return { isAdmin: user?.role === "admin" };
  });

const FUNNEL_EVENT_NAMES: readonly string[] = ["paywall_shown", "pricing_viewed", "checkout_started", "payment_succeeded"];

/** Метрики дашборда: тоталы, графики по дням за 30 дней и воронка конверсии. */
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const now = new Date();
    const since7 = sinceDays(7);
    const since30 = sinceDays(30);

    const [
      usersTotal,
      usersNew7d,
      activePro,
      revenue30d,
      revenueTotal,
      registrations,
      succeededPayments,
      reviews,
      generations,
      funnelGroups,
    ] = await Promise.all([
      context.db.user.count(),
      context.db.user.count({ where: { createdAt: { gte: since7 } } }),
      context.db.subscription.count({ where: { status: { not: "EXPIRED" }, currentPeriodEnd: { gt: now } } }),
      context.db.payment.aggregate({
        _sum: { amount: true },
        where: { status: "SUCCEEDED", createdAt: { gte: since30 } },
      }),
      context.db.payment.aggregate({ _sum: { amount: true }, where: { status: "SUCCEEDED" } }),
      context.db.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
      context.db.payment.findMany({
        where: { status: "SUCCEEDED", createdAt: { gte: since30 } },
        select: { createdAt: true, amount: true },
      }),
      context.db.review.findMany({ where: { reviewedAt: { gte: since30 } }, select: { reviewedAt: true } }),
      context.db.usageEvent.findMany({
        where: { kind: "deck_generation", createdAt: { gte: since30 } },
        select: { createdAt: true },
      }),
      context.db.analyticsEvent.groupBy({
        by: ["name"],
        where: { name: { in: [...FUNNEL_EVENT_NAMES] }, createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
    ]);

    const funnelCount = (name: string) => funnelGroups.find((group) => group.name === name)?._count._all ?? 0;

    return {
      totals: {
        usersTotal,
        usersNew7d,
        activePro,
        revenue30dKopecks: revenue30d._sum.amount ?? 0,
        revenueTotalKopecks: revenueTotal._sum.amount ?? 0,
      },
      registrationsDaily: buildDailySeries(
        registrations.map((user) => ({ at: user.createdAt, weight: 1 })),
        30,
      ),
      revenueDailyKopecks: buildDailySeries(
        succeededPayments.map((payment) => ({ at: payment.createdAt, weight: payment.amount })),
        30,
      ),
      reviewsDaily: buildDailySeries(
        reviews.map((review) => ({ at: review.reviewedAt, weight: 1 })),
        30,
      ),
      generationsDaily: buildDailySeries(
        generations.map((event) => ({ at: event.createdAt, weight: 1 })),
        30,
      ),
      funnel: {
        paywallShown: funnelCount("paywall_shown"),
        pricingViewed: funnelCount("pricing_viewed"),
        checkoutStarted: funnelCount("checkout_started"),
        paymentSucceeded: funnelCount("payment_succeeded"),
      },
    };
  });

/** Страница пользователей: поиск по email/имени, страницы по 30, агрегаты без N+1. */
export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(
    zodRussian.object({
      query: zodRussian.string().max(200).optional(),
      offset: zodRussian.number().int().nonnegative().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const offset = data.offset ?? 0;
    const query = data.query?.trim();
    const where: Prisma.UserWhereInput = query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        }
      : {};

    const users = await context.db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        subscription: { select: { status: true, currentPeriodEnd: true, provider: true } },
        _count: {
          select: {
            decks: true,
            reviews: true,
            usageEvents: { where: { kind: "deck_generation" } },
          },
        },
      },
    });

    const userIds = users.map((user) => user.id);
    // Карточки лежат в колодах — количество по владельцу считаем одним raw-запросом на страницу.
    const cardRows = userIds.length
      ? await context.db.$queryRaw<{ userId: string; n: number }[]>`
          SELECT d."userId" AS "userId", count(c.id)::int AS n
          FROM "Card" c
          JOIN "Deck" d ON d.id = c."deckId"
          WHERE d."userId" = ANY(${userIds})
          GROUP BY d."userId"
        `
      : [];
    const lastReviewGroups = userIds.length
      ? await context.db.review.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _max: { reviewedAt: true },
        })
      : [];
    const cardsByUser = new Map(cardRows.map((row) => [row.userId, row.n]));
    const lastReviewByUser = new Map(lastReviewGroups.map((group) => [group.userId, group._max.reviewedAt]));

    const now = new Date();
    return {
      users: users.map((user) => {
        const subscription = user.subscription;
        const proActive = Boolean(
          subscription && subscription.status !== "EXPIRED" && subscription.currentPeriodEnd > now,
        );
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          deckCount: user._count.decks,
          cardCount: cardsByUser.get(user.id) ?? 0,
          reviewCount: user._count.reviews,
          generationsUsed: user._count.usageEvents,
          lastReviewAt: lastReviewByUser.get(user.id) ?? null,
          proUntil: proActive && subscription ? subscription.currentPeriodEnd : null,
          proProvider: proActive && subscription ? subscription.provider : null,
        };
      }),
      nextOffset: users.length === PAGE_SIZE ? offset + users.length : null,
    };
  });

/** Последние платежи пользователя — для раскрытой карточки в списке. */
export const getAdminUserPayments = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(zodRussian.object({ userId: zodRussian.string() }))
  .handler(({ data, context }) =>
    context.db.payment.findMany({
      where: { userId: data.userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        status: true,
        periodDays: true,
        providerPaymentId: true,
      },
    }),
  );

/**
 * Ручное управление Pro: grant — выдать/продлить до конца выбранного дня МСК
 * (upsert: ACTIVE, provider MANUAL, без автопродления), revoke — отключить немедленно.
 */
export const setUserSubscription = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(
    zodRussian.object({
      userId: zodRussian.string(),
      action: zodRussian.enum(["grant", "revoke"]),
      untilDate: zodRussian
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const user = await context.db.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!user) {
      setResponseStatus(404);
      throw new Error(typo("Пользователь не найден"));
    }

    if (data.action === "revoke") {
      const revoked = await context.db.subscription.updateMany({
        where: { userId: data.userId },
        data: { status: "EXPIRED", currentPeriodEnd: new Date() },
      });
      if (!revoked.count) {
        setResponseStatus(400);
        throw new Error(typo("У пользователя нет подписки"));
      }
      return true;
    }

    if (!data.untilDate) {
      setResponseStatus(400);
      throw new Error(typo("Укажите дату окончания Pro"));
    }
    // Доступ — до конца выбранного календарного дня по Москве.
    const currentPeriodEnd = new Date(`${data.untilDate}T23:59:59.999+03:00`);
    if (Number.isNaN(currentPeriodEnd.getTime()) || currentPeriodEnd <= new Date()) {
      setResponseStatus(400);
      throw new Error(typo("Дата окончания Pro должна быть в будущем"));
    }
    await context.db.subscription.upsert({
      where: { userId: data.userId },
      update: { plan: "PRO", status: "ACTIVE", provider: "MANUAL", currentPeriodEnd, cancelAtPeriodEnd: true },
      create: {
        userId: data.userId,
        plan: "PRO",
        status: "ACTIVE",
        provider: "MANUAL",
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      },
    });
    return true;
  });

/** Возвращает пользователю последнюю списанную попытку ИИ-генерации колоды (удаляет UsageEvent). */
export const refundGenerationUsage = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(zodRussian.object({ userId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const lastEvent = await context.db.usageEvent.findFirst({
      where: { userId: data.userId, kind: "deck_generation" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!lastEvent) {
      setResponseStatus(400);
      throw new Error(typo("У пользователя нет списанных попыток генерации"));
    }
    await context.db.usageEvent.delete({ where: { id: lastEvent.id } });
    const remainingUsed = await context.db.usageEvent.count({
      where: { userId: data.userId, kind: "deck_generation" },
    });
    return { remainingUsed };
  });

/** Все платежи (новые сверху) страницами по 30; тоталы по статусам — только на первой странице. */
export const getAdminPayments = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(zodRussian.object({ offset: zodRussian.number().int().nonnegative().optional() }))
  .handler(async ({ data, context }) => {
    const offset = data.offset ?? 0;
    const payments = await context.db.payment.findMany({
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        status: true,
        plan: true,
        periodDays: true,
        provider: true,
        providerPaymentId: true,
        user: { select: { email: true } },
      },
    });

    let totals: {
      succeededCount: number;
      succeededKopecks: number;
      refundedCount: number;
      refundedKopecks: number;
      pendingCount: number;
    } | null = null;
    if (!offset) {
      const groups = await context.db.payment.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { amount: true },
      });
      const groupOf = (status: "SUCCEEDED" | "REFUNDED" | "PENDING") =>
        groups.find((group) => group.status === status);
      totals = {
        succeededCount: groupOf("SUCCEEDED")?._count._all ?? 0,
        succeededKopecks: groupOf("SUCCEEDED")?._sum.amount ?? 0,
        refundedCount: groupOf("REFUNDED")?._count._all ?? 0,
        refundedKopecks: groupOf("REFUNDED")?._sum.amount ?? 0,
        pendingCount: groupOf("PENDING")?._count._all ?? 0,
      };
    }

    return {
      totals,
      payments: payments.map((payment) => ({
        id: payment.id,
        createdAt: payment.createdAt,
        amount: payment.amount,
        status: payment.status,
        plan: payment.plan,
        periodDays: payment.periodDays,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        userEmail: payment.user.email,
      })),
      nextOffset: payments.length === PAGE_SIZE ? offset + payments.length : null,
    };
  });

/**
 * Полный возврат успешного платежа ЮKassa: деньги — через API, затем Payment → REFUNDED,
 * подписка пользователя гаснет сразу. Идемпотентность в три слоя: повторный вызов режется
 * проверкой статуса (уже REFUNDED → 400); запрос в ЮKassa идёт с детерминированным
 * Idempotence-Key `refund-{paymentId}` — ретрай после сбоя между возвратом и записью в БД
 * получит тот же возврат, а не второй; вебхук refund.succeeded тоже идемпотентен
 * (updateMany по статусу «не REFUNDED» в yookassaWebhook.ts повторно ничего не сделает).
 */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(zodRussian.object({ paymentId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    if (!isYookassaConfigured()) {
      setResponseStatus(503);
      throw new Error(typo("ЮKassa не сконфигурирована — возврат недоступен"));
    }
    const payment = await context.db.payment.findUnique({ where: { id: data.paymentId } });
    if (!payment) {
      setResponseStatus(404);
      throw new Error(typo("Платёж не найден"));
    }
    if (payment.provider !== "YOOKASSA" || payment.status !== "SUCCEEDED") {
      setResponseStatus(400);
      throw new Error(typo("Вернуть можно только успешный платёж ЮKassa"));
    }

    const refund = await createRefund(
      payment.providerPaymentId,
      payment.amount / 100,
      typo("Возврат по решению поддержки"),
      `refund-${payment.id}`,
    );
    if (refund.status === "canceled") {
      setResponseStatus(502);
      throw new Error(typo("ЮKassa отклонила возврат"));
    }

    const now = new Date();
    await context.db.$transaction([
      context.db.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAt: now } }),
      context.db.subscription.updateMany({
        where: { userId: payment.userId },
        data: { status: "EXPIRED", currentPeriodEnd: now },
      }),
      context.db.analyticsEvent.create({
        data: {
          name: "payment_refunded",
          userId: payment.userId,
          meta: { paymentId: payment.id, amountKopecks: payment.amount },
        },
      }),
    ]);
    return true;
  });

/** Мониторинг генераций: очередь сейчас, последние ошибки, ряд за 7 дней и топ-10 пользователей. */
export const getAdminGeneration = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const since7 = sinceDays(7);
    const since30 = sinceDays(30);

    const [processingDecks, failedDecks, weekEvents, topGroups] = await Promise.all([
      context.db.deck.findMany({
        where: { status: "processing" },
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, createdAt: true, user: { select: { email: true } } },
      }),
      context.db.deck.findMany({
        where: { status: "failed" },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, title: true, generationError: true, updatedAt: true, user: { select: { email: true } } },
      }),
      context.db.usageEvent.findMany({
        where: { kind: "deck_generation", createdAt: { gte: since7 } },
        select: { createdAt: true },
      }),
      context.db.usageEvent.groupBy({
        by: ["userId"],
        where: { kind: "deck_generation", createdAt: { gte: since30 } },
        _count: { _all: true },
        orderBy: { _count: { userId: "desc" } },
        take: 10,
      }),
    ]);

    const topUserRows = topGroups.length
      ? await context.db.user.findMany({
          where: { id: { in: topGroups.map((group) => group.userId) } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(topUserRows.map((user) => [user.id, user.email]));

    return {
      processing: processingDecks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        ownerEmail: deck.user.email,
        createdAt: deck.createdAt,
        // 0 — генерируется сейчас, ≥1 — ждёт очереди, null — в очереди процесса нет (потеряна при рестарте).
        queuePosition: getGenerationQueuePosition(deck.id),
      })),
      failed: failedDecks.map((deck) => ({
        id: deck.id,
        title: deck.title,
        ownerEmail: deck.user.email,
        failedAt: deck.updatedAt,
        error: deck.generationError,
      })),
      generationsDaily: buildDailySeries(
        weekEvents.map((event) => ({ at: event.createdAt, weight: 1 })),
        7,
      ),
      topUsers: topGroups.map((group) => ({
        userId: group.userId,
        email: emailById.get(group.userId) ?? group.userId,
        count: group._count._all,
      })),
    };
  });

export type AdminUserItem = Awaited<ReturnType<typeof getAdminUsers>>["users"][number];
export type AdminUserPaymentItem = Awaited<ReturnType<typeof getAdminUserPayments>>[number];
export type AdminPaymentItem = Awaited<ReturnType<typeof getAdminPayments>>["payments"][number];
