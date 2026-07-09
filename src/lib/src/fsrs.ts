// Обвязка ts-fsrs: конвертация CardProgress ↔ ts-fsrs Card, планировщик под дату экзамена
// и вероятность припоминания. Чистый изоморфный модуль — вся FSRS-математика живёт здесь.

import { type Card as FsrsCard, type FSRS, fsrs, generatorParameters, type Grade, Rating, State } from "ts-fsrs";

/** Оценка ответа по FSRS: 1 Again / 2 Hard / 3 Good / 4 Easy. */
export type ReviewRating = 1 | 2 | 3 | 4;

/** FSRS-поля CardProgress — то, что нужно движку от строки прогресса. */
export interface ProgressLike {
  stability: number;
  difficulty: number;
  due: Date;
  /** ts-fsrs State: 0 New / 1 Learning / 2 Review / 3 Relearning. */
  state: number;
  reps: number;
  lapses: number;
  lastReviewedAt: Date | null;
}

/** Новое FSRS-состояние после ответа — ровно те поля CardProgress, которые пишет сервер. */
export interface ProgressPatch {
  stability: number;
  difficulty: number;
  due: Date;
  state: number;
  reps: number;
  lapses: number;
}

const GRADE_BY_RATING: Record<ReviewRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

// В БД state — просто Int; сужаем к enum ts-fsrs без «as» (позиция в массиве = числовое значение).
const FSRS_STATES: readonly State[] = [State.New, State.Learning, State.Review, State.Relearning];

function toFsrsState(state: number): State {
  return FSRS_STATES[state] ?? State.New;
}

function toFsrsCard(progress: ProgressLike): FsrsCard {
  return {
    due: progress.due,
    stability: progress.stability,
    difficulty: progress.difficulty,
    // Устаревшие/служебные поля ts-fsrs: алгоритм считает elapsed по last_review, эти нули безопасны.
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: progress.reps,
    lapses: progress.lapses,
    state: toFsrsState(progress.state),
    last_review: progress.lastReviewedAt ?? undefined,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Внутридневные learning/relearning-шаги ts-fsrs отключены: индекс шага не хранится
// в CardProgress, из-за чего карточка навсегда застревала бы в Learning на 10-минутном
// интервале. Продукт — дневные сессии, минимальный интервал = 1 день; при Again карточка
// получает короткий интервал за счёт упавшей stability.
const NO_LEARNING_STEPS: readonly [] = [];

/**
 * Планировщик под дату экзамена (Cepeda: оптимальный интервал ≈ 30% оставшегося срока):
 * maximum_interval = clamp(round(0.3 × daysToExam), 1, 90), retention 0.95 при ≤ 7 дней.
 * Без даты — поддерживающее повторение: maximum_interval 365, retention 0.9.
 */
export function makeScheduler(daysToExam: number | null): FSRS {
  if (daysToExam === null) {
    return fsrs(
      generatorParameters({
        maximum_interval: 365,
        request_retention: 0.9,
        learning_steps: NO_LEARNING_STEPS,
        relearning_steps: NO_LEARNING_STEPS,
      }),
    );
  }
  return fsrs(
    generatorParameters({
      maximum_interval: clampNumber(Math.round(0.3 * daysToExam), 1, 90),
      request_retention: daysToExam <= 7 ? 0.95 : 0.9,
      learning_steps: NO_LEARNING_STEPS,
      relearning_steps: NO_LEARNING_STEPS,
    }),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Применяет оценку к прогрессу: ts-fsrs `next()` → новые stability/difficulty/due/state/reps/lapses.
 * Due жёстко капится по maximum_interval: basic-scheduler ts-fsrs у капа отдаёт Good/Easy
 * на 1–2 дня дальше (гарантия Hard < Good < Easy), а у даты экзамена перелёт недопустим.
 */
export function reviewProgress(
  scheduler: FSRS,
  progress: ProgressLike,
  rating: ReviewRating,
  now: Date,
): ProgressPatch {
  const { card } = scheduler.next(toFsrsCard(progress), now, GRADE_BY_RATING[rating]);
  const maxDue = new Date(now.getTime() + scheduler.parameters.maximum_interval * DAY_MS);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due > maxDue ? maxDue : card.due,
    state: card.state,
    reps: card.reps,
    lapses: card.lapses,
  };
}

// Ретривабилити зависит только от кривой забывания (веса w), не от maximum_interval —
// один общий инстанс на все экзамены.
const retrievabilityScheduler = fsrs();

/** Вероятность припоминания 0..1 сейчас; новая карточка (не было повторений) = 0. */
export function retrievability(progress: ProgressLike, now: Date): number {
  if (toFsrsState(progress.state) === State.New || !progress.reps) return 0;
  return retrievabilityScheduler.get_retrievability(toFsrsCard(progress), now, false);
}
