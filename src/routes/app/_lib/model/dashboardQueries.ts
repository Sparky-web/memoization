import { queryOptions } from "@tanstack/react-query";

import { getAdminAccess } from "~/server/fn/admin";
import { getBillingStatus } from "~/server/fn/billing";
import { getExams } from "~/server/fn/exams";
import { getTodayPlan } from "~/server/fn/plan";
import { getUserSettings } from "~/server/fn/settings";

export type { ExamListItem } from "~/server/fn/exams";

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
  exams: () =>
    queryOptions({
      queryKey: ["exams", "list"],
      queryFn: () => getExams(),
      // Пока идёт генерация хотя бы одного экзамена — обновляем список.
      refetchInterval: (query) => (query.state.data?.some((exam) => exam.status === "processing") ? 4000 : false),
    }),
  todayPlan: () =>
    queryOptions({
      queryKey: ["plan", "today"],
      queryFn: () => getTodayPlan(),
    }),
  settings: () =>
    queryOptions({
      queryKey: ["settings", "user"],
      queryFn: () => getUserSettings(),
    }),
};
