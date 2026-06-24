import { ChatPanel, Heading, MarkdownView, ResponsiveModal, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { useCardChat } from "../model/chatModel";

interface CardDeepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  title: string;
  answerDeep: string;
  // Чат по карточке — только для владельца колоды (история общая на карточку, server fn скоупится по владельцу).
  canChat: boolean;
}

// Окно «подробнее»: развёрнутый ответ + (для владельца) чат по теме карточки с историей.
export function CardDeepDialog({ open, onOpenChange, cardId, title, answerDeep, canChat }: CardDeepDialogProps) {
  const { messages, loading, ask } = useCardChat(cardId, open && canChat);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      <VStack gap="md">
        <MarkdownView>{answerDeep}</MarkdownView>
        {canChat && (
          <>
            <div className="border-border border-t" />
            <Heading variant="h3">{typo("Спросить по теме")}</Heading>
            {loading ? (
              <Text variant="small" color="supplementary">
                {typo("Загрузка истории…")}
              </Text>
            ) : (
              <ChatPanel
                messages={messages}
                pending={ask.isPending}
                pendingQuestion={ask.isPending ? (ask.variables ?? null) : null}
                onSend={(text) => {
                  ask.mutate(text);
                }}
              />
            )}
          </>
        )}
      </VStack>
    </ResponsiveModal>
  );
}
