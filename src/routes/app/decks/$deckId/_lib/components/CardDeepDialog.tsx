import { ChatPanel, Heading, MarkdownView, ResponsiveModal, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { useCardChat } from "../model/chatModel";

interface CardDeepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  title: string;
  answerDeep: string;
}

// Окно «подробнее»: развёрнутый ответ + чат по теме карточки (с историей).
export function CardDeepDialog({ open, onOpenChange, cardId, title, answerDeep }: CardDeepDialogProps) {
  const { messages, loading, ask } = useCardChat(cardId, open);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      <VStack gap="md">
        <MarkdownView>{answerDeep}</MarkdownView>
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
      </VStack>
    </ResponsiveModal>
  );
}
