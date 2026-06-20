import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { typo } from "~/lib";
import { askCardChat, type ChatMessageView, getCardChat } from "~/server/fn/chat";

interface CardChatData {
  messages: ChatMessageView[];
}

// История чата по карточке и отправка нового вопроса. Запрос активен только когда модалка открыта.
export function useCardChat(cardId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["cardChat", cardId];

  const chat = useQuery({
    queryKey,
    queryFn: () => getCardChat({ data: { cardId } }),
    enabled,
  });

  const ask = useMutation({
    mutationFn: (message: string) => askCardChat({ data: { cardId, message } }),
    onSuccess: (result) => {
      queryClient.setQueryData<CardChatData>(queryKey, (previous) => ({
        messages: [...(previous?.messages ?? []), result.userMessage, result.assistantMessage],
      }));
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось отправить вопрос"));
    },
  });

  return { messages: chat.data?.messages ?? [], loading: chat.isLoading && enabled, ask };
}
