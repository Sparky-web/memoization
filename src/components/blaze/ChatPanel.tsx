import { Send } from "lucide-react";
import { useState } from "react";

import { typo } from "~/lib";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { HStack } from "./HStack";
import { MarkdownView } from "./MarkdownView";
import { Text } from "./Text";
import { VStack } from "./VStack";

export interface ChatPanelMessage {
  id: string;
  role: string;
  content: string;
}

interface ChatPanelProps {
  messages: ChatPanelMessage[];
  pending: boolean;
  /** Отправляемый сейчас вопрос — показываем оптимистично, пока ждём ответ. */
  pendingQuestion: string | null;
  onSend: (text: string) => void;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground">
        <Text variant="small">{content}</Text>
      </div>
    </div>
  );
}

function AssistantBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] min-w-0 overflow-hidden rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
        <MarkdownView>{content}</MarkdownView>
      </div>
    </div>
  );
}

// Чат по теме карточки: лента сообщений + поле ввода. Логику данных задаёт родитель.
export function ChatPanel({ messages, pending, pendingQuestion, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <VStack gap="sm">
      {messages.length || pendingQuestion ? (
        <VStack gap="sm">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} content={message.content} />
            ) : (
              <AssistantBubble key={message.id} content={message.content} />
            ),
          )}
          {pendingQuestion ? <UserBubble content={pendingQuestion} /> : null}
          {pending ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                <Text variant="small" color="supplementary">
                  {typo("Помощник печатает…")}
                </Text>
              </div>
            </div>
          ) : null}
        </VStack>
      ) : (
        <Text variant="small" color="supplementary">
          {typo("Задайте вопрос по теме — помощник ответит с учётом этой карточки.")}
        </Text>
      )}

      {/* Поле ввода прижато к низу окна (sticky), чтобы не уезжало под клавиатуру на мобиле. */}
      <div className="sticky bottom-0 border-t border-border bg-card pt-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <HStack gap="sm" align="end">
            <Textarea
              value={text}
              className="min-h-16"
              placeholder={typo("Спросите что-нибудь по теме…")}
              onChange={(event) => {
                setText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <Button type="submit" size="icon" disabled={pending || !text.trim()}>
              <Send className="size-4" />
            </Button>
          </HStack>
        </form>
      </div>
    </VStack>
  );
}
