import { type PrismaClient } from "@prisma/client";

import { readiness, retrievability } from "~/lib";

// Готовность экзаменов пользователя: средняя вероятность припоминания по не-suspended
// карточкам (новая карточка = 0). Одна пара запросов на любой список экзаменов — без N+1.

/** Map examId → готовность 0..1. Экзамен без карточек — 0. */
export async function examReadinessMap(
  db: PrismaClient,
  userId: string,
  examIds: readonly string[],
  now: Date,
): Promise<Map<string, number>> {
  if (!examIds.length) return new Map();

  const cards = await db.card.findMany({
    where: { examId: { in: [...examIds] }, suspended: false },
    select: { id: true, examId: true },
  });
  const progressRows = await db.cardProgress.findMany({
    where: { userId, cardId: { in: cards.map((card) => card.id) } },
    select: {
      cardId: true,
      stability: true,
      difficulty: true,
      due: true,
      state: true,
      reps: true,
      lapses: true,
      lastReviewedAt: true,
    },
  });
  const progressByCard = new Map(progressRows.map((row) => [row.cardId, row]));

  const byExam = new Map<string, { retrievability: number }[]>();
  for (const card of cards) {
    const progress = progressByCard.get(card.id);
    const value = progress ? retrievability(progress, now) : 0;
    const bucket = byExam.get(card.examId);
    if (bucket) {
      bucket.push({ retrievability: value });
    } else {
      byExam.set(card.examId, [{ retrievability: value }]);
    }
  }

  const result = new Map<string, number>();
  for (const examId of examIds) {
    result.set(examId, readiness(byExam.get(examId) ?? []));
  }
  return result;
}
