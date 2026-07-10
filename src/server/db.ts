import { PrismaClient } from "@prisma/client";

import { serverEnv } from "~/env.server";

const createPrismaClient = () =>
  new PrismaClient({
    log: serverEnv.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

declare global {
  // Singleton переживает hot-reload в dev: клиент кладётся в globalThis

  var prismaGlobal: ReturnType<typeof createPrismaClient> | undefined;
}

export const db = globalThis.prismaGlobal ?? createPrismaClient();

if (serverEnv.NODE_ENV !== "production") globalThis.prismaGlobal = db;
