import { BILLING_PLAN_IDS, BILLING_PLANS, type BillingPlanId, typo } from "~/lib";

/** Данные карточки тарифа для витрины: тексты собраны заранее, рендер их не составляет. */
export interface PricingPlanView {
  id: BillingPlanId;
  title: string;
  priceLabel: string;
  daysLabel: string;
  tagline: string;
  /** Герой-тариф «До сессии»: выделенная карточка с бейджем. */
  hero: boolean;
  badge: string | null;
  /** Подпись-якорь у героя: сравнение с помесячной оплатой. */
  note: string | null;
}

const TAGLINES: Record<BillingPlanId, string> = {
  MONTH: typo("Попробовать и закрыть один предмет"),
  TERM: typo("Хватит на всю сессию — с запасом"),
  YEAR: typo("Весь учебный год, включая пересдачи"),
};

const TERM_NOTE = typo(`${BILLING_PLANS.MONTH.rub} ₽ × 3 = ${BILLING_PLANS.MONTH.rub * 3} ₽ — дороже`);

export function buildPricingPlans(): readonly PricingPlanView[] {
  return BILLING_PLAN_IDS.map((planId): PricingPlanView => {
    const plan = BILLING_PLANS[planId];
    const hero = planId === "TERM";
    return {
      id: planId,
      title: plan.title,
      priceLabel: typo(`${plan.rub} ₽`),
      daysLabel: typo(`${plan.days} дней доступа`),
      tagline: TAGLINES[planId],
      hero,
      badge: hero ? typo("Выгоднее всего") : null,
      note: hero ? TERM_NOTE : null,
    };
  });
}
