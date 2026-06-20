import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { typo, zodRussian } from "~/lib";
import { generateChatReply } from "~/server/chat";
import { authMiddleware } from "~/server/middleware";

// Чат по теме карточки: история диалога и отправка нового вопроса в Claude.

const messageSelect = { id: true, role: true, content: true };
// Сколько последних реплик отдаём в промпт (история в БД хранится целиком, но в модель
// шлём окно — иначе промпт растёт без предела: цена, задержка, в итоге таймаут).
const CHAT_HISTORY_WINDOW = 16;
// Потолок длины сохраняемого ответа — защита от разрастания контента.
const MAX_REPLY_CHARS = 12000;
// Не даём одному пользователю держать несколько одновременных запросов к claude.
const inFlightUsers = new Set<string>();

export const getCardChat = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, deck: { userId: context.session.user.id } },
      select: { id: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    const messages = await context.db.chatMessage.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: "asc" },
      select: messageSelect,
    });
    return { messages };
  });

export const askCardChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ cardId: zodRussian.string(), message: zodRussian.string().min(1).max(2000) }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const card = await context.db.card.findFirst({
      where: { id: data.cardId, deck: { userId } },
      select: { id: true, question: true, answer: true, answerDeep: true },
    });
    if (!card) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }

    if (inFlightUsers.has(userId)) {
      setResponseStatus(429);
      throw new Error(typo("Дождитесь ответа на предыдущий вопрос."));
    }
    inFlightUsers.add(userId);
    try {
      // В промпт отдаём только окно последних реплик (до текущего вопроса), по порядку.
      const recent = await context.db.chatMessage.findMany({
        where: { cardId: card.id },
        orderBy: { createdAt: "desc" },
        take: CHAT_HISTORY_WINDOW,
        select: { role: true, content: true },
      });
      const history = recent.reverse();

      // Вопрос сохраняем сразу (его createdAt заведомо раньше ответа); если Claude не ответил —
      // откатываем висящий вопрос.
      const userMessage = await context.db.chatMessage.create({
        data: { cardId: card.id, role: "user", content: data.message },
        select: messageSelect,
      });

      let reply: string;
      try {
        reply = await generateChatReply(card, history, data.message);
      } catch (error) {
        await context.db.chatMessage.delete({ where: { id: userMessage.id } }).catch(() => undefined);
        console.error(error);
        setResponseStatus(502);
        throw new Error(typo("Не удалось получить ответ. Попробуйте ещё раз."), { cause: error });
      }

      const assistantMessage = await context.db.chatMessage.create({
        data: { cardId: card.id, role: "assistant", content: reply.slice(0, MAX_REPLY_CHARS) },
        select: messageSelect,
      });

      return { userMessage, assistantMessage };
    } finally {
      inFlightUsers.delete(userId);
    }
  });

export type ChatMessageView = Awaited<ReturnType<typeof getCardChat>>["messages"][number];
