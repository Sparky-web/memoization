import { queryOptions } from "@tanstack/react-query";

import { getConceptMaps } from "~/server/fn/conceptMaps";

// Данные страницы карты связей: список карт экзамена и мутации редактора.

export type { ConceptMapItem } from "~/server/fn/conceptMaps";
export { deleteConceptMap, generateConceptMapDraft, updateConceptMap } from "~/server/fn/conceptMaps";

export const mapQueries = {
  list: (examId: string) =>
    queryOptions({
      queryKey: ["conceptMaps", examId],
      queryFn: () => getConceptMaps({ data: { examId } }),
    }),
};
