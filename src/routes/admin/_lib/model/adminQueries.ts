import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import {
  getAdminDashboard,
  getAdminGeneration,
  getAdminPayments,
  getAdminUserPayments,
  getAdminUsers,
} from "~/server/fn/admin";

export const adminQueries = {
  dashboard: () => queryOptions({ queryKey: ["admin", "dashboard"], queryFn: () => getAdminDashboard() }),
  // Пользователи и платежи — постранично; строка поиска в ключе → отдельный кэш на запрос.
  users: (query: string) =>
    infiniteQueryOptions({
      queryKey: ["admin", "users", query],
      queryFn: ({ pageParam }) => getAdminUsers({ data: { query: query || undefined, offset: pageParam } }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    }),
  userPayments: (userId: string) =>
    queryOptions({
      queryKey: ["admin", "userPayments", userId],
      queryFn: () => getAdminUserPayments({ data: { userId } }),
    }),
  payments: () =>
    infiniteQueryOptions({
      queryKey: ["admin", "payments"],
      queryFn: ({ pageParam }) => getAdminPayments({ data: { offset: pageParam } }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextOffset,
    }),
  // Мониторинг живой очереди — период опроса короткий.
  generation: () =>
    queryOptions({
      queryKey: ["admin", "generation"],
      queryFn: () => getAdminGeneration(),
      refetchInterval: 10_000,
    }),
};

export type { AdminPaymentItem, AdminUserItem, AdminUserPaymentItem } from "~/server/fn/admin";
