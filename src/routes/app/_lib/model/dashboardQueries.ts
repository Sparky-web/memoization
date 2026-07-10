import { queryOptions } from "@tanstack/react-query";

import { getAdminAccess } from "~/server/fn/admin";
import { getSession } from "~/server/fn/auth";
import { getBillingStatus } from "~/server/fn/billing";

// Сессия почти не меняется — короткий кэш убирает серверный roundtrip guard'а
// на каждом внутреннем переходе (иначе любая навигация ждала бы сеть).
const AUTH_SESSION_STALE_MS = 5 * 60 * 1000;

// Запросы шапки приложения (меню пользователя). Экзаменный домен живёт
// в src/routes/app/exams/_lib (examQueries) — ключи согласованы.
export const dashboardQueries = {
  // Guard /app читает сессию отсюда; при выходе кэш чистится целиком (UserMenu).
  authSession: () =>
    queryOptions({
      queryKey: ["auth", "session"],
      queryFn: () => getSession(),
      staleTime: AUTH_SESSION_STALE_MS,
    }),
  // Статус подписки для пункта «Подписка» в меню пользователя.
  billing: () =>
    queryOptions({
      queryKey: ["billing", "status"],
      queryFn: () => getBillingStatus(),
    }),
  // Флаг администратора — только для пункта «Админка» в открытом меню пользователя.
  adminAccess: () =>
    queryOptions({
      queryKey: ["admin", "access"],
      queryFn: () => getAdminAccess(),
    }),
};
