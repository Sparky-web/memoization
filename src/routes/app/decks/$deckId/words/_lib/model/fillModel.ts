import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { typo } from "~/lib";
import { dislikeFillTask, submitFillAnswer } from "~/server/fn/exercises";

export type { FillSessionTask } from "~/server/fn/exercises";

export function useFillAnswer() {
  return useMutation({
    mutationFn: (input: { taskId: string; answer: string }) => submitFillAnswer({ data: input }),
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось проверить ответ"));
    },
  });
}

export function useFillDislike() {
  return useMutation({
    mutationFn: (taskId: string) => dislikeFillTask({ data: { taskId } }),
    onSuccess: () => {
      toast.success(typo("Задание скрыто"));
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось скрыть задание"));
    },
  });
}
