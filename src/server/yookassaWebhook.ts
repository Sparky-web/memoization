import { BILLING_PLAN_IDS, BILLING_PLANS, zodRussian } from "~/lib";

import { db } from "./db";
import { shrinkSubscriptionAfterRefund } from "./entitlement";
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
      // Продлеваем только необработанный платёж (PENDING). Платёж в ЮKassa после возврата
      // остаётся succeeded, поэтому повторная доставка payment.succeeded не должна поднимать
      // запись из REFUNDED/CANCELED — иначе возвращённый деньгами пользователь снова получил бы Pro.
      const updated = await tx.payment.updateMany({
        where: { providerPaymentId: payment.id, status: "PENDING" },
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
    // Безлимитный Pro (currentPeriodEnd = null, выдан админом) платёж не понижает до срочного:
    // Payment записан выше, подписку не трогаем. Warning — в Sentry на ручной разбор (вероятно, возврат).
    if (subscription && subscription.status !== "EXPIRED" && !subscription.currentPeriodEnd) {
      console.warn(`ЮKassa: платёж ${payment.id} поверх безлимитного Pro пользователя ${userId} — подписка не изменена`);
    } else {
      const paidUntil = subscription?.currentPeriodEnd;
      const extendFrom = paidUntil && paidUntil > now ? paidUntil : now;
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
    }
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

/**
 * Успешный ПОЛНЫЙ возврат: Payment → REFUNDED, у подписки отзываются дни именно этого платежа
 * (currentPeriodEnd уменьшается на его periodDays с клампом к «сейчас») — дни, оплаченные
 * другими платежами, сохраняются. Частичный возврат из кабинета ЮKassa доступом не управляет:
 * платёж остаётся SUCCEEDED, случай уходит в Sentry на ручной разбор.
 */
async function applySucceededRefund(refundId: string): Promise<void> {
  const refund = await getRefund(refundId);
  if (refund.status !== "succeeded") return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const paymentRow = await tx.payment.findUnique({ where: { providerPaymentId: refund.payment_id } });
    if (!paymentRow) return;

    const refundedKopecks = Math.round(Number(refund.amount.value) * 100);
    if (Number.isFinite(refundedKopecks) && refundedKopecks < paymentRow.amount) {
      console.error(
        `ЮKassa: частичный возврат ${refund.id} (${refundedKopecks} из ${paymentRow.amount} коп.) по платежу ${refund.payment_id} — статус платежа и подписка не изменены`,
      );
      return;
    }

    const updated = await tx.payment.updateMany({
      where: { providerPaymentId: refund.payment_id, status: { not: "REFUNDED" } },
      data: { status: "REFUNDED", refundedAt: now },
    });
    if (!updated.count) return;

    await shrinkSubscriptionAfterRefund(tx, paymentRow.userId, paymentRow.periodDays, now);
  });
}

/**
 * Вебхук ЮKassa. При сбое обработки (недоступна БД, упал перезапрос платежа) отвечаем 500 —
 * ЮKassa ретраит доставку с нарастающими интервалами (до ~суток), и временный сбой не теряет
 * оплаченный Pro навсегда. Повторные доставки безопасны: обработчики идемпотентны.
 * Ошибки уходят в Sentry через console.error.
 */
export async function handleYookassaWebhook(request: Request): Promise<Response> {
  try {
    if (!isYookassaConfigured()) {
      console.error("Вебхук ЮKassa пришёл при не сконфигурированных ключах — вернули 500 для повторной доставки");
      return new Response("NOT CONFIGURED", { status: 500 });
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
    return new Response("ERROR", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
