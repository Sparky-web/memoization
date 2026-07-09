import { serverEnv } from "~/env.server";
import { typo, zodRussian } from "~/lib";

// Тонкий клиент API ЮKassa: https://yookassa.ru/developers/api
// Ответы не «доверяются» — каждый парсится zod-схемой (unknown → parse).

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

const amountSchema = zodRussian.object({
  value: zodRussian.string(),
  currency: zodRussian.string(),
});

// metadata передаём только строками — так же и валидируем
const metadataSchema = zodRussian.record(zodRussian.string(), zodRussian.string());

const paymentSchema = zodRussian.object({
  id: zodRussian.string(),
  status: zodRussian.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]),
  amount: amountSchema,
  description: zodRussian.string().optional(),
  metadata: metadataSchema.optional(),
  confirmation: zodRussian
    .object({
      type: zodRussian.string(),
      confirmation_url: zodRussian.string().optional(),
    })
    .optional(),
});

const refundSchema = zodRussian.object({
  id: zodRussian.string(),
  payment_id: zodRussian.string(),
  status: zodRussian.enum(["pending", "succeeded", "canceled"]),
  amount: amountSchema,
});

export type YookassaPayment = ReturnType<typeof paymentSchema.parse>;
export type YookassaRefund = ReturnType<typeof refundSchema.parse>;

/** Оплата доступна только когда оба секрета заданы; иначе server functions отвечают 503. */
export function isYookassaConfigured(): boolean {
  return Boolean(serverEnv.YOOKASSA_SHOP_ID && serverEnv.YOOKASSA_SECRET_KEY);
}

function basicAuthHeader(): string {
  const credentials = `${serverEnv.YOOKASSA_SHOP_ID ?? ""}:${serverEnv.YOOKASSA_SECRET_KEY ?? ""}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

async function yookassaRequest(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotenceKey?: string },
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: basicAuthHeader(),
    "Content-Type": "application/json",
  };
  // Idempotence-Key обязателен для всех POST: повтор запроса с тем же ключом не создаст дубль.
  // Для операций с естественным ключом (возврат по платежу) вызывающий передаёт детерминированный ключ,
  // чтобы ретрай после сбоя вернул тот же объект, а не создал новый запрос.
  if (init.method === "POST") headers["Idempotence-Key"] = init.idempotenceKey ?? crypto.randomUUID();

  const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(typo(`ЮKassa ${init.method} ${path}: ${response.status} — ${details}`));
  }
  return response.json();
}

/** Рублёвая сумма в формате ЮKassa: строка с двумя знаками ("990.00"). */
function rubAmount(amountRub: number): { value: string; currency: string } {
  return { value: amountRub.toFixed(2), currency: "RUB" };
}

export interface CreatePaymentInput {
  amountRub: number;
  description: string;
  returnUrl: string;
  /** email покупателя — обязателен для чека 54-ФЗ. */
  customerEmail: string;
  /** Только строки: ЮKassa вернёт metadata как есть в вебхуке и при перезапросе платежа. */
  metadata: Record<string, string>;
}

/** Создаёт платёж с автозахватом и чеком 54-ФЗ; возвращает платёж с confirmation_url для редиректа. */
export async function createPayment(input: CreatePaymentInput): Promise<YookassaPayment> {
  const amount = rubAmount(input.amountRub);
  const raw = await yookassaRequest("/payments", {
    method: "POST",
    body: {
      amount,
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description,
      metadata: input.metadata,
      // Чек 54-ФЗ: vat_code 1 — «без НДС» (самозанятость/УСН)
      receipt: {
        customer: { email: input.customerEmail },
        items: [
          {
            description: input.description,
            quantity: "1.00",
            amount,
            vat_code: 1,
            payment_subject: "service",
            payment_mode: "full_payment",
          },
        ],
      },
    },
  });
  return paymentSchema.parse(raw);
}

/** Источник правды для вебхука: статус платежа перезапрашивается по id, телу вебхука не доверяем. */
export async function getPayment(paymentId: string): Promise<YookassaPayment> {
  const raw = await yookassaRequest(`/payments/${paymentId}`, { method: "GET" });
  return paymentSchema.parse(raw);
}

/** Перезапрос возврата по id — для проверки события refund.succeeded. */
export async function getRefund(refundId: string): Promise<YookassaRefund> {
  const raw = await yookassaRequest(`/refunds/${refundId}`, { method: "GET" });
  return refundSchema.parse(raw);
}

/**
 * Возврат (полный или частичный) по платежу — для админки и поддержки.
 * idempotenceKey детерминирован на стороне вызывающего: повтор с тем же ключом и телом
 * вернёт уже созданный возврат вместо второй попытки списания.
 */
export async function createRefund(
  paymentId: string,
  amountRub: number,
  description: string,
  idempotenceKey: string,
): Promise<YookassaRefund> {
  const raw = await yookassaRequest("/refunds", {
    method: "POST",
    body: { payment_id: paymentId, amount: rubAmount(amountRub), description },
    idempotenceKey,
  });
  return refundSchema.parse(raw);
}
