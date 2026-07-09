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

// Лимиты бесплатного тарифа: один экзамен целиком бесплатен (сессии, FSRS, готовность, серии),
// платим за мультиэкзамены и дорогой ИИ. Матрица — docs/domashnik.md, раздел 7.
/** Активных (неархивных) экзаменов на Free. */
export const FREE_EXAMS = 1;
/** Вопросов на экзамен на Free. */
export const FREE_QUESTIONS_PER_EXAM = 60;
/** ИИ-генераций экзамена бесплатно — всего, не в день. */
export const FREE_DECK_GENERATIONS = 1;
/** Сообщений чата/«объясни ученику» в календарный день МСК. */
export const FREE_CHAT_PER_DAY = 10;

// Лимиты Pro: потолки fair-use — защита от злоупотребления дорогими вызовами claude.
export const PRO_EXAMS = 10;
export const PRO_QUESTIONS_PER_EXAM = 300;
export const PRO_DECK_GENERATIONS_PER_DAY = 5;
export const PRO_CHAT_PER_DAY = 50;

/**
 * Машиночитаемые коды paywall-ошибок: сервер кидает их в message при статусе 402,
 * клиент матчит по коду и показывает соответствующий paywall. Латиницей — не переводить.
 */
export const PAYWALL_ERRORS: {
  readonly GENERATION: "PAYWALL_GENERATION";
  readonly CHAT: "PAYWALL_CHAT";
  readonly MULTI_EXAM: "PAYWALL_MULTI_EXAM";
  readonly MATERIALS: "PAYWALL_MATERIALS";
  readonly VOICE: "PAYWALL_VOICE";
  readonly AI_CHECK: "PAYWALL_AI_CHECK";
  readonly CRAM: "PAYWALL_CRAM";
} = {
  GENERATION: "PAYWALL_GENERATION",
  CHAT: "PAYWALL_CHAT",
  MULTI_EXAM: "PAYWALL_MULTI_EXAM",
  MATERIALS: "PAYWALL_MATERIALS",
  VOICE: "PAYWALL_VOICE",
  AI_CHECK: "PAYWALL_AI_CHECK",
  CRAM: "PAYWALL_CRAM",
};

/** Идентификатор тарифа для покупки Pro. */
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

/** Причина пейвола = ключ PAYWALL_ERRORS; по ней подбираются тексты PaywallCard. */
export type PaywallReason = keyof typeof PAYWALL_ERRORS;

const PAYWALL_REASONS: readonly PaywallReason[] = [
  "GENERATION",
  "CHAT",
  "MULTI_EXAM",
  "MATERIALS",
  "VOICE",
  "AI_CHECK",
  "CRAM",
];

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
