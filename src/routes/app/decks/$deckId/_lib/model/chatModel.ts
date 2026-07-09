import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isPaywallError, typo } from "~/lib";
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
      queryClient.setQueryData<CardChatData>(queryKey, (previous) => {
        const existing = previous?.messages ?? [];
        // Рефокус окна мог уже рефетчнуть историю с обеими репликами (в БД они пишутся
        // до ответа мутации) — добавляем только те, которых в кэше ещё нет, без дублей.
        const appended = [result.userMessage, result.assistantMessage].filter(
          (message) => !existing.some((existingMessage) => existingMessage.id === message.id),
        );
        return { messages: [...existing, ...appended] };
      });
    },
    onError: (error) => {
      // Дневной лимит чата — не ошибка: диалог сам покажет PaywallCard по ask.error.
      if (isPaywallError(error, "CHAT")) return;
      console.error(error);
      // Русский текст с сервера (fair-use Pro, «дождитесь ответа») показываем как есть.
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось отправить вопрос");
      toast.error(humanMessage);
    },
  });

  return { messages: chat.data?.messages ?? [], loading: chat.isLoading && enabled, ask };
}
