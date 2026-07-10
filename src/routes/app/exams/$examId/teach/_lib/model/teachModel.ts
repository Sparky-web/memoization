import { queryOptions } from "@tanstack/react-query";

import { getSpeechStatus, getTeachSessions } from "~/server/fn/teach";

// Данные страницы «объясни ученику»: статус голосового слоя и история сессий.

export type { TeachSessionItem, TeachTurnItem } from "~/server/fn/teach";
export { createTeachSession, finishTeachSession, sendTeachMessage } from "~/server/fn/teach";

export const teachQueries = {
  speechStatus: () =>
    queryOptions({
      queryKey: ["speech", "status"],
      queryFn: () => getSpeechStatus(),
    }),
  sessions: (examId: string) =>
    queryOptions({
      queryKey: ["teach", "sessions", examId],
      queryFn: () => getTeachSessions({ data: { examId } }),
    }),
};
