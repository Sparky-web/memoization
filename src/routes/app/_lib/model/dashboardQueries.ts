import { queryOptions } from "@tanstack/react-query";

import { getAdminAccess } from "~/server/fn/admin";
import { getBillingStatus } from "~/server/fn/billing";

// Запросы шапки приложения (меню пользователя). Экзаменный домен живёт
// в src/routes/app/exams/_lib (examQueries) — ключи согласованы.
export const dashboardQueries = {
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
