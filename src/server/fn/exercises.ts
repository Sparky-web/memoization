import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import { EXERCISE_BATCH_SIZE, nextExerciseWeight, normalizeAnswer, sampleByWeight, shuffleItems, typo, zodRussian } from "~/lib";
import { enqueueDeckExercises } from "~/server/generation";
import { authMiddleware } from "~/server/middleware";

// Тренажёр: режимы «вставь слово» и «тесты». Порция взвешена по «спотыканию»,
// дизлайкнутые задания исключаются. Всё скоупится по владельцу колоды.

const FILL_OPTIONS_LIMIT = 4;

// --- Режим «вставь слово» ---

export const getFillSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, userId: context.session.user.id },
      select: { id: true, title: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }

    const tasks = await context.db.fillTask.findMany({
      where: { deckId: deck.id, hidden: false },
      select: { id: true, prompt: true, answer: true, distractors: true, weight: true },
    });

    const batch = sampleByWeight(tasks, EXERCISE_BATCH_SIZE);

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      tasks: batch.map((task) => {
        // Дистракторы: убираем дубли и совпадения с ответом, берём не более лимита−1.
        const distractors = shuffleItems(
          [...new Set(task.distractors)].filter((option) => option !== task.answer),
        ).slice(0, FILL_OPTIONS_LIMIT - 1);
        // Ответ добавляем гарантированно (иначе slice мог бы его отрезать) и перемешиваем весь набор.
        return { id: task.id, prompt: task.prompt, options: shuffleItems([task.answer, ...distractors]) };
      }),
    };
  });

export const submitFillAnswer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ taskId: zodRussian.string(), answer: zodRussian.string().max(400) }))
  .handler(async ({ data, context }) => {
    const task = await context.db.fillTask.findFirst({
      where: { id: data.taskId, deck: { userId: context.session.user.id } },
      select: { id: true, answer: true, weight: true },
    });
    if (!task) {
      setResponseStatus(404);
      throw new Error(typo("Задание не найдено"));
    }

    const correct = normalizeAnswer(data.answer) === normalizeAnswer(task.answer);
    await context.db.fillTask.update({
      where: { id: task.id },
      data: {
        weight: nextExerciseWeight(task.weight, correct),
        attempts: { increment: 1 },
        correctCount: { increment: correct ? 1 : 0 },
        wrongCount: { increment: correct ? 0 : 1 },
        lastSeenAt: new Date(),
      },
    });

    return { correct, answer: task.answer };
  });

export const dislikeFillTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ taskId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    await context.db.fillTask.updateMany({
      where: { id: data.taskId, deck: { userId: context.session.user.id } },
      data: { hidden: true },
    });
    return true;
  });

// --- Режим «тесты» ---

export const getQuizSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, userId: context.session.user.id },
      select: { id: true, title: true },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }

    const tasks = await context.db.quizTask.findMany({
      where: { deckId: deck.id, hidden: false },
      select: { id: true, question: true, options: true, weight: true },
    });

    const batch = sampleByWeight(tasks, EXERCISE_BATCH_SIZE);

    return {
      deckId: deck.id,
      deckTitle: deck.title,
      // Варианты дедупим и перемешиваем; correctIndex клиенту не отдаём — верность проверяем по тексту на submit.
      tasks: batch.map((task) => ({ id: task.id, question: task.question, options: shuffleItems([...new Set(task.options)]) })),
    };
  });

export const submitQuizAnswer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ taskId: zodRussian.string(), answer: zodRussian.string().max(600) }))
  .handler(async ({ data, context }) => {
    const task = await context.db.quizTask.findFirst({
      where: { id: data.taskId, deck: { userId: context.session.user.id } },
      select: { id: true, options: true, correctIndex: true, explanation: true, weight: true },
    });
    if (!task) {
      setResponseStatus(404);
      throw new Error(typo("Вопрос не найден"));
    }

    const correctAnswer = task.options[task.correctIndex] ?? "";
    const correct = data.answer === correctAnswer;
    await context.db.quizTask.update({
      where: { id: task.id },
      data: {
        weight: nextExerciseWeight(task.weight, correct),
        attempts: { increment: 1 },
        correctCount: { increment: correct ? 1 : 0 },
        wrongCount: { increment: correct ? 0 : 1 },
        lastSeenAt: new Date(),
      },
    });

    return { correct, correctAnswer, explanation: task.explanation };
  });

export const dislikeQuizTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ taskId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    await context.db.quizTask.updateMany({
      where: { id: data.taskId, deck: { userId: context.session.user.id } },
      data: { hidden: true },
    });
    return true;
  });

// --- Догенерация заданий/тестов для готовой колоды ---

export const generateDeckExercises = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(zodRussian.object({ deckId: zodRussian.string() }))
  .handler(async ({ data, context }) => {
    const deck = await context.db.deck.findFirst({
      where: { id: data.deckId, userId: context.session.user.id },
      select: { id: true, _count: { select: { cards: true } } },
    });
    if (!deck) {
      setResponseStatus(404);
      throw new Error(typo("Колода не найдена"));
    }
    if (!deck._count.cards) {
      setResponseStatus(400);
      throw new Error(typo("В колоде нет карточек для генерации заданий"));
    }

    // Атомарный «захват»: переводим в processing только если генерация ещё не идёт.
    // Так двойной клик/ретрай не поставит в очередь два прохода Claude на одну колоду.
    const claimed = await context.db.deck.updateMany({
      where: { id: deck.id, userId: context.session.user.id, exercisesStatus: { not: "processing" } },
      data: { exercisesStatus: "processing", exercisesError: null },
    });
    if (!claimed.count) {
      setResponseStatus(409);
      throw new Error(typo("Задания уже генерируются"));
    }
    enqueueDeckExercises(deck.id);
    return true;
  });

// Догенерация для всех готовых колод пользователя, где заданий ещё нет (бэкофилл существующих колод).
export const generateMissingExercises = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id;
    const decks = await context.db.deck.findMany({
      where: {
        userId,
        status: "ready",
        exercisesStatus: { in: ["none", "failed"] },
        cards: { some: {} },
      },
      select: { id: true },
    });
    // Каждую колоду захватываем атомарно по отдельности — enqueue только реально захваченные,
    // чтобы параллельные вызовы не поставили дубли проходов Claude.
    let queued = 0;
    for (const deck of decks) {
      const claimed = await context.db.deck.updateMany({
        where: { id: deck.id, userId, exercisesStatus: { in: ["none", "failed"] } },
        data: { exercisesStatus: "processing", exercisesError: null },
      });
      if (claimed.count) {
        enqueueDeckExercises(deck.id);
        queued += 1;
      }
    }
    return { queued };
  });

export type FillSessionTask = Awaited<ReturnType<typeof getFillSession>>["tasks"][number];
export type QuizSessionTask = Awaited<ReturnType<typeof getQuizSession>>["tasks"][number];
