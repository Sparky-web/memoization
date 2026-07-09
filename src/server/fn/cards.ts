import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { retrievability, typo, zodRussian } from "~/lib";
import { authMiddleware } from "~/server/middleware";

// Библиотека карточек экзамена: список с прогрессом и ручное управление
// (правка, добавление, флаг «проверить», выключение). Всё скоупится по владельцу экзамена.

const cardFieldsInput = zodRussian.object({
  format: zodRussian.enum(["open", "mcq", "cloze", "truefalse"]),
  prompt: zodRussian.string().min(1).max(4000),
  answer: zodRussian.string().min(1).max(8000),
  options: zodRussian.array(zodRussian.string().min(1).max(600)).max(8),
  explanation: zodRussian.string().max(2000).nullable(),
  deepMd: zodRussian.string().max(30000).nullable(),
  mnemonic: zodRussian.string().max(1000).nullable(),
});

type CardFields = ReturnType<typeof cardFieldsInput.parse>;

// Инварианты форматов (те же проверяет валидация генерации в волне 2).
function assertCardShape(card: CardFields): void {
  if (card.format === "mcq" && (card.options.length < 2 || !card.options.includes(card.answer))) {
    setResponseStatus(400);
    throw new Error(typo("Для теста нужно минимум 2 варианта, и правильный ответ должен быть среди них"));
  }
  if (card.format === "cloze" && !card.prompt.includes("___")) {
    setResponseStatus(400);
    throw new Error(typo("В тексте с пропуском должно быть место пропуска «___»"));
  }
  if (card.format === "truefalse" && card.answer !== "true" && card.answer !== "false") {
    setResponseStatus(400);
    throw new Error(typo("Ответ карточки «верно/неверно» — true или false"));
  }
}

export const getExamCards = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;
    const exam = await context.db.exam.findFirst({
      where: { id: data.examId, userId },
      select: { id: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }

    const now = new Date();
    const cards = await context.db.card.findMany({
      where: { examId: exam.id },
      orderBy: { position: "asc" },
      select: {
        id: true,
        format: true,
        prompt: true,
        answer: true,
        options: true,
        explanation: true,
        deepMd: true,
        mnemonic: true,
        sourceRef: true,
        aiGenerated: true,
        flagged: true,
        suspended: true,
        position: true,
        question: { select: { id: true, topic: true } },
        progress: {
          where: { userId },
          select: {
            stability: true,
            difficulty: true,
            due: true,
            state: true,
            reps: true,
            lapses: true,
            lastReviewedAt: true,
            masteredDays: true,
            priority: true,
          },
        },
      },
    });

    return cards.map((card) => {
      const progress = card.progress[0] ?? null;
      return {
        id: card.id,
        format: card.format,
        prompt: card.prompt,
        answer: card.answer,
        options: card.options,
        explanation: card.explanation,
        deepMd: card.deepMd,
        mnemonic: card.mnemonic,
        sourceRef: card.sourceRef,
        aiGenerated: card.aiGenerated,
        flagged: card.flagged,
        suspended: card.suspended,
        position: card.position,
        questionId: card.question?.id ?? null,
        topic: card.question?.topic ?? null,
        progress: progress
          ? {
              state: progress.state,
              due: progress.due,
              reps: progress.reps,
              lapses: progress.lapses,
              masteredDays: progress.masteredDays,
              priority: progress.priority,
              retrievability: retrievability(progress, now),
            }
          : null,
      };
    });
  });

export const addCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ examId: zodRussian.string(), data: cardFieldsInput }))
  .handler(async ({ data: input, context }) => {
    assertCardShape(input.data);
    const exam = await context.db.exam.findFirst({
      where: { id: input.examId, userId: context.session.user.id },
      select: { id: true },
    });
    if (!exam) {
      setResponseStatus(404);
      throw new Error(typo("Экзамен не найден"));
    }
    const lastCard = await context.db.card.findFirst({
      where: { examId: exam.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const created = await context.db.card.create({
      data: {
        examId: exam.id,
        format: input.data.format,
        prompt: input.data.prompt,
        answer: input.data.answer,
        options: input.data.options,
        explanation: input.data.explanation,
        deepMd: input.data.deepMd,
        mnemonic: input.data.mnemonic,
        position: (lastCard?.position ?? -1) + 1,
      },
      select: { id: true },
    });
    return created;
  });

export const updateCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), data: cardFieldsInput }))
  .handler(async ({ data: input, context }) => {
    assertCardShape(input.data);
    const result = await context.db.card.updateMany({
      where: { id: input.id, exam: { userId: context.session.user.id } },
      data: {
        format: input.data.format,
        prompt: input.data.prompt,
        answer: input.data.answer,
        options: input.data.options,
        explanation: input.data.explanation,
        deepMd: input.data.deepMd,
        mnemonic: input.data.mnemonic,
        // Правка руками снимает флаг «проверить» — пользователь уже разобрался.
        flagged: false,
      },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.card.deleteMany({
      where: { id: data.id, exam: { userId: context.session.user.id } },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });

export const flagCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), flagged: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.card.updateMany({
      where: { id: data.id, exam: { userId: context.session.user.id } },
      data: { flagged: data.flagged },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });

export const suspendCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ id: zodRussian.string(), suspended: zodRussian.boolean() }))
  .handler(async ({ data, context }) => {
    const result = await context.db.card.updateMany({
      where: { id: data.id, exam: { userId: context.session.user.id } },
      data: { suspended: data.suspended },
    });
    if (!result.count) {
      setResponseStatus(404);
      throw new Error(typo("Карточка не найдена"));
    }
    return true;
  });

export type ExamCardItem = Awaited<ReturnType<typeof getExamCards>>[number];
