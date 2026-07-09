import { queryOptions } from "@tanstack/react-query";

import { getAnxietyDumps } from "~/server/fn/wellbeing";

// Модель дня экзамена: приватные записи выгрузки тревог.
export { type AnxietyDumpItem, createAnxietyDump, deleteAnxietyDump } from "~/server/fn/wellbeing";

export const wellbeingQueries = {
  dumps: (examId: string) =>
    queryOptions({
      queryKey: ["anxiety", "dumps", examId],
      queryFn: () => getAnxietyDumps({ data: { examId } }),
    }),
};
