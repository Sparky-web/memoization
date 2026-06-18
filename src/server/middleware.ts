import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import { auth } from "./auth";
import { db } from "./db";

/** Аналог publicProcedure: кладёт db в контекст. */
export const baseMiddleware = createMiddleware({ type: "function" }).server(({ next }) => next({ context: { db } }));

/** Аналог protectedProcedure: требует живую сессию better-auth. */
export const authMiddleware = createMiddleware({ type: "function" })
  .middleware([baseMiddleware])
  .server(async ({ next, context }) => {
    const session = await auth.api.getSession({
      headers: new Headers(getRequestHeaders()),
    });

    if (!session) {
      setResponseStatus(401);
      throw new Error("UNAUTHORIZED");
    }

    return next({ context: { ...context, session } });
  });
