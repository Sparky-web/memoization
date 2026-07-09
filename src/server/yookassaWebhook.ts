import { BILLING_PLAN_IDS, BILLING_PLANS, zodRussian } from "~/lib";

import { db } from "./db";
import { getPayment, getRefund, isYookassaConfigured, type YookassaPayment } from "./yookassa";

const DAY_MS = 24 * 60 * 60 * 1000;

// Телу вебхука не доверяем (подписи нет): берём только event и id объекта,
// статус перезапрашиваем по API — он и есть источник правды.
const webhookBodySchema = zodRussian.object({
  event: zodRussian.string(),
  object: zodRussian.object({ id: zodRussian.string() }),
});

const planIdSchema = zodRussian.enum(BILLING_PLAN_IDS);

function parsePeriodDays(payment: YookassaPayment): number | null {
  const raw = payment.metadata?.periodDays;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

/**
 * Успешный платёж: Payment → SUCCEEDED, подписка продлевается от максимума (сейчас, текущий конец) —
 * оплата заранее добавляет дни, а не сжигает. Идемпотентно: условный update записи Payment держит
 * блокировку строки, повторная доставка вебхука не продлит подписку второй раз.
 */
async function applySucceededPayment(payment: YookassaPayment): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { providerPaymentId: payment.id } });
    if (existing) {
      const updated = await tx.payment.updateMany({
        where: { providerPaymentId: payment.id, status: { not: "SUCCEEDED" } },
        data: { status: "SUCCEEDED" },
      });
      if (!updated.count) return;
    }

    const userId = existing?.userId ?? payment.metadata?.userId;
    if (!userId) {
      console.error(`ЮKassa: платёж ${payment.id} без userId в metadata и без записи Payment — Pro не выдан`);
      return;
    }

    const parsedPlan = planIdSchema.safeParse(payment.metadata?.plan);
    const fallbackDays = parsedPlan.success ? BILLING_PLANS[parsedPlan.data].days : BILLING_PLANS.MONTH.days;
    const periodDays = parsePeriodDays(payment) ?? existing?.periodDays ?? fallbackDays;

    // Payment мог не создаться в createCheckout (сбой после оплаты) — восстанавливаем из данных ЮKassa
    if (!existing) {
      const kopecks = Math.round(Number(payment.amount.value) * 100);
      await tx.payment.create({
        data: {
          provider: "YOOKASSA",
          providerPaymentId: payment.id,
          amount: Number.isFinite(kopecks) ? kopecks : 0,
          currency: payment.amount.currency,
          status: "SUCCEEDED",
          plan: "PRO",
          periodDays,
          description: payment.description ?? null,
          userId,
        },
      });
    }

    const subscription = await tx.subscription.findUnique({ where: { userId } });
    const extendFrom = subscription && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
    const currentPeriodEnd = new Date(extendFrom.getTime() + periodDays * DAY_MS);
    await tx.subscription.upsert({
      where: { userId },
      update: { plan: "PRO", status: "ACTIVE", provider: "YOOKASSA", currentPeriodEnd, cancelAtPeriodEnd: true },
      create: {
        userId,
        plan: "PRO",
        status: "ACTIVE",
        provider: "YOOKASSA",
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      },
    });
    await tx.analyticsEvent.create({
      data: { name: "payment_succeeded", userId, meta: { plan: payment.metadata?.plan ?? null, periodDays } },
    });
  });
}

async function applyCanceledPayment(paymentId: string): Promise<void> {
  // Только из PENDING: отменённый после успеха платёж закрывается возвратом, а не этим событием
  await db.payment.updateMany({
    where: { providerPaymentId: paymentId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
}

/** Успешный возврат: Payment → REFUNDED и немедленный отзыв доступа (подписка истекает сейчас). */
async function applySucceededRefund(refundId: string): Promise<void> {
  const refund = await getRefund(refundId);
  if (refund.status !== "succeeded") return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { providerPaymentId: refund.payment_id, status: { not: "REFUNDED" } },
      data: { status: "REFUNDED", refundedAt: now },
    });
    if (!updated.count) return;
    const paymentRow = await tx.payment.findUnique({ where: { providerPaymentId: refund.payment_id } });
    if (!paymentRow) return;
    await tx.subscription.updateMany({
      where: { userId: paymentRow.userId },
      data: { status: "EXPIRED", currentPeriodEnd: now },
    });
  });
}

/**
 * Вебхук ЮKassa. Всегда отвечает 200 — на любой другой статус ЮKassa ретраит бесконечно;
 * ошибки уходят в Sentry через console.error.
 */
export async function handleYookassaWebhook(request: Request): Promise<Response> {
  try {
    if (!isYookassaConfigured()) {
      console.error("Вебхук ЮKassa пришёл при не сконфигурированных ключах — событие пропущено");
      return new Response("OK", { status: 200 });
    }
    const body = webhookBodySchema.parse(await request.json());
    if (body.event === "payment.succeeded" || body.event === "payment.canceled") {
      const payment = await getPayment(body.object.id);
      if (payment.status === "succeeded") await applySucceededPayment(payment);
      if (payment.status === "canceled") await applyCanceledPayment(payment.id);
    }
    if (body.event === "refund.succeeded") {
      await applySucceededRefund(body.object.id);
    }
  } catch (error) {
    console.error("Ошибка обработки вебхука ЮKassa", error);
  }
  return new Response("OK", { status: 200 });
}
