import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { typo } from "~/lib";
import { dislikeQuizTask, submitQuizAnswer } from "~/server/fn/exercises";

export type { QuizSessionTask } from "~/server/fn/exercises";

export function useQuizAnswer() {
  return useMutation({
    mutationFn: (input: { taskId: string; answer: string }) => submitQuizAnswer({ data: input }),
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось проверить ответ"));
    },
  });
}

export function useQuizDislike() {
  return useMutation({
    mutationFn: (taskId: string) => dislikeQuizTask({ data: { taskId } }),
    onSuccess: () => {
      toast.success(typo("Вопрос скрыт"));
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось скрыть вопрос"));
    },
  });
}
