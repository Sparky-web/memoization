import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "~/server/auth";

/** Сессия better-auth (null для анонима) — используется в guard'ах роутов и UserProvider. */
export const getSession = createServerFn({ method: "GET" }).handler(() =>
  auth.api.getSession({ headers: new Headers(getRequestHeaders()) }),
);
