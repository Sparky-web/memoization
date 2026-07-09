import { typo } from "./typo";

/** Тариф Pro: разовая оплата, дни доступа. Без автопродления (cancelAtPeriodEnd = true). */
export interface BillingPlan {
  /** Цена в рублях (целых). */
  rub: number;
  /** Сколько дней доступа даёт тариф. */
  days: number;
  title: string;
}

export const BILLING_PLANS = {
  MONTH: { rub: 490, days: 30, title: typo("Месяц") },
  TERM: { rub: 990, days: 90, title: typo("До сессии") },
  YEAR: { rub: 1990, days: 365, title: typo("Год") },
} satisfies Record<string, BillingPlan>;

/** Порядок ключей для валидаторов и витрины тарифов. */
export const BILLING_PLAN_IDS: readonly ["MONTH", "TERM", "YEAR"] = ["MONTH", "TERM", "YEAR"];

// Лимиты бесплатного тарифа: платим только за дорогой ИИ (генерации — claude opus).
// Ручные колоды, повторения и тренажёры — безлимит для всех.
/** ИИ-генераций колод бесплатно — всего, не в день. */
export const FREE_DECK_GENERATIONS = 1;
/** ИИ-генераций заданий/тестов бесплатно — всего, не в день. */
export const FREE_EXERCISE_GENERATIONS = 1;
/** Сообщений чата по карточке в календарный день МСК. */
export const FREE_CHAT_PER_DAY = 10;

// Fair-use лимиты Pro — защита от злоупотребления дорогими вызовами claude.
export const PRO_DECK_GENERATIONS_PER_DAY = 5;
export const PRO_CHAT_PER_DAY = 50;

/**
 * Машиночитаемые коды paywall-ошибок: сервер кидает их в message при статусе 402,
 * клиент матчит по коду и показывает соответствующий paywall. Латиницей — не переводить.
 */
export const PAYWALL_ERRORS: {
  readonly GENERATION: "PAYWALL_GENERATION";
  readonly EXERCISES: "PAYWALL_EXERCISES";
  readonly CHAT: "PAYWALL_CHAT";
} = {
  GENERATION: "PAYWALL_GENERATION",
  EXERCISES: "PAYWALL_EXERCISES",
  CHAT: "PAYWALL_CHAT",
};

/** Идентификатор тарифа для покупки Pro. */
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

/** Причина пейвола = ключ PAYWALL_ERRORS; по ней подбираются тексты PaywallCard. */
export type PaywallReason = keyof typeof PAYWALL_ERRORS;

const PAYWALL_REASONS: readonly PaywallReason[] = ["GENERATION", "EXERCISES", "CHAT"];

/** Причина пейвола из ошибки server function (сервер кладёт код в message при 402) или null. */
export function paywallReasonOf(error: unknown): PaywallReason | null {
  if (!(error instanceof Error)) return null;
  return PAYWALL_REASONS.find((reason) => PAYWALL_ERRORS[reason] === error.message) ?? null;
}

/** Проверка «это пейвол-ошибка», опционально с конкретной причиной — для клиентских catch. */
export function isPaywallError(error: unknown, reason?: PaywallReason): boolean {
  const found = paywallReasonOf(error);
  if (!found) return false;
  return reason ? found === reason : true;
}
