import { queryOptions } from "@tanstack/react-query";

import { getOverallStats } from "~/server/fn/stats";

export type { ActivityPoint, OverallStats } from "~/server/fn/stats";

export const statsQueries = {
  overall: () =>
    queryOptions({
      queryKey: ["stats", "overall"],
      queryFn: () => getOverallStats(),
    }),
};
