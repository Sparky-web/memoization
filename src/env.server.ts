import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    DATABASE_URL: z.url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    BETTER_AUTH_SECRET: process.env.NODE_ENV === "production" ? z.string().min(1) : z.string().min(1).optional(),
    BETTER_AUTH_URL: z.url(),

    // Ключи ЮKassa опциональны: без них оплата отвечает 503, остальное приложение работает
    YOOKASSA_SHOP_ID: z.string().optional(),
    YOOKASSA_SECRET_KEY: z.string().optional(),

    SENTRY_URL: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
