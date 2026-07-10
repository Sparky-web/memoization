import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { serverEnv } from "~/env.server";
import { BILLING_PLAN_IDS, BILLING_PLANS, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";
import { createPayment, isYookassaConfigured } from "~/server/yookassa";

function daysWord(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return typo("дней");
  if (mod10 === 1) return typo("день");
  if (mod10 >= 2 && mod10 <= 4) return typo("дня");
  return typo("дней");
}

/**
 * Статус подписки для клиента: флаг Pro и конец периода. Клиент не видит Prisma-типов.
 * currentPeriodEnd = null при pro = true — безлимитный Pro (выдан админом).
 */
export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const subscription = await context.db.subscription.findUnique({
      where: { userId: context.session.user.id },
    });
    const now = new Date();
    const active = Boolean(
      subscription &&
      subscription.status !== "EXPIRED" &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now),
    );
    return {
      pro: active,
      currentPeriodEnd: active && subscription ? subscription.currentPeriodEnd : null,
    };
  });

/**
 * Создаёт платёж в ЮKassa и запись Payment(PENDING); возвращает ссылку на страницу оплаты.
 * Pro выдаёт не эта функция, а вебхук по подтверждённому платежу (источник правды — API ЮKassa).
 */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ plan: zodRussian.enum(BILLING_PLAN_IDS) }))
  .handler(async ({ data: input, context }) => {
    if (!isYookassaConfigured()) {
      setResponseStatus(503);
      throw new Error(typo("Оплата временно недоступна"));
    }
    const userId = context.session.user.id;
    const billingPlan = BILLING_PLANS[input.plan];
    const periodDays = billingPlan.days;

    const description = typo(`Домашник Pro — тариф «${billingPlan.title}» на ${periodDays} ${daysWord(periodDays)}`);
    const payment = await createPayment({
      amountRub: billingPlan.rub,
      description,
      returnUrl: `${serverEnv.BETTER_AUTH_URL}/pricing/success`,
      customerEmail: context.session.user.email,
      metadata: { userId, plan: input.plan, periodDays: String(periodDays) },
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      setResponseStatus(502);
      throw new Error(typo("ЮKassa не вернула ссылку на оплату — попробуйте ещё раз"));
    }

    await context.db.$transaction([
      context.db.payment.create({
        data: {
          provider: "YOOKASSA",
          providerPaymentId: payment.id,
          amount: billingPlan.rub * 100,
          currency: "RUB",
          status: "PENDING",
          plan: "PRO",
          periodDays,
          description,
          userId,
        },
      }),
      context.db.analyticsEvent.create({
        data: { name: "checkout_started", userId, meta: { plan: input.plan, periodDays } },
      }),
    ]);

    return { confirmationUrl };
  });
