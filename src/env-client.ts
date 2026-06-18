import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Имя файла не env.client.ts: файлы *.client.* запрещены к импорту в server-окружении
// import-protection'ом TanStack Start, а этот конфиг нужен и на сервере (SSR)
export const clientEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
