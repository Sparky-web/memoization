import { queryOptions } from "@tanstack/react-query";

import { getBillingStatus } from "~/server/fn/billing";
import { getExamCards } from "~/server/fn/cards";
import { getExamById, getExams } from "~/server/fn/exams";
import { getTodayPlan } from "~/server/fn/plan";
import { getQuestionById } from "~/server/fn/questions";
import { startSession } from "~/server/fn/session";
import { getUserSettings } from "~/server/fn/settings";

import { type SessionKind } from "../lib/sessionKinds";

export type { ExamCardItem } from "~/server/fn/cards";
export type { ExamListItem } from "~/server/fn/exams";

export type ExamDetail = Awaited<ReturnType<typeof getExamById>>;
export type ExamQuestionItem = ExamDetail["questions"][number];
export type TodayPlan = Awaited<ReturnType<typeof getTodayPlan>>;

// Единые queryOptions экзаменного домена: ключи согласованы так, что invalidateQueries
// по префиксу ["exams"] обновляет и список, и детали, и библиотеку карточек.
export const examQueries = {
  list: () =>
    queryOptions({
      queryKey: ["exams", "list"],
      queryFn: () => getExams(),
      // Пока идёт генерация хотя бы одного экзамена — поллим статус и позицию в очереди.
      refetchInterval: (query) => (query.state.data?.some((exam) => exam.status === "processing") ? 4000 : false),
    }),
  detail: (examId: string) =>
    queryOptions({
      queryKey: ["exams", "detail", examId],
      queryFn: () => getExamById({ data: { id: examId } }),
      refetchInterval: (query) => (query.state.data?.status === "processing" ? 4000 : false),
    }),
  cards: (examId: string) =>
    queryOptions({
      queryKey: ["exams", "cards", examId],
      queryFn: () => getExamCards({ data: { examId } }),
    }),
  question: (questionId: string) =>
    queryOptions({
      queryKey: ["questions", "detail", questionId],
      queryFn: () => getQuestionById({ data: { id: questionId } }),
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
  billing: () =>
    queryOptions({
      queryKey: ["billing", "status"],
      queryFn: () => getBillingStatus(),
    }),
  // Очередь сессии строится один раз: staleTime «навсегда», без ретраев и рефетча по фокусу —
  // иначе очередь пересобралась бы посреди прохождения.
  session: (examId: string, kind: SessionKind) =>
    queryOptions({
      queryKey: ["session", examId, kind],
      queryFn: () => startSession({ data: { examId, kind } }),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
      refetchOnWindowFocus: false,
    }),
};
