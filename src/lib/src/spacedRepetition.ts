// Планировщик интервального повторения: SM-2 (коэффициент лёгкости + растущий интервал)
// с Leitner-боксом для наглядности прогресса. Чистая изоморфная функция — её зовёт server fn
// при свайпе, а классификатор стадии используется и на клиенте (бейджи карточек).

/** Оценка вспоминания: свайп вправо — вспомнил, влево — было сложно. */
export type ReviewGrade = "again" | "good";

/** Стадия усвоения карточки — для бейджей и статистики. */
export type CardStage = "new" | "learning" | "mastered";

interface CardScheduleState {
  box: number;
  ease: number;
  intervalDays: number;
  reps: number;
  streak: number;
}

interface ScheduledCard extends CardScheduleState {
  /** Через сколько минут карточка снова станет к показу — вызывающий считает по этому dueAt. */
  dueInMinutes: number;
}

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_BOX = 6;
// Левый свайп: карточка возвращается уже внутри сессии (шаг обучения в минуту),
// поэтому трудные вопросы показываются заметно чаще лёгких.
const AGAIN_STEP_MINUTES = 1;
const MINUTES_PER_DAY = 24 * 60;
// Порог «усвоено»: интервал дорос до трёх недель.
const MASTERED_INTERVAL_DAYS = 21;

/** Новое состояние карточки после ответа. dueInMinutes → dueAt считает вызывающий код. */
export function scheduleNextReview(state: CardScheduleState, grade: ReviewGrade): ScheduledCard {
  if (grade === "again") {
    return {
      box: Math.max(state.box - 1, 0),
      ease: Math.max(state.ease - 0.2, MIN_EASE),
      intervalDays: 0,
      reps: state.reps + 1,
      streak: 0,
      dueInMinutes: AGAIN_STEP_MINUTES,
    };
  }

  const streak = state.streak + 1;
  const ease = Math.min(state.ease + 0.05, MAX_EASE);
  const intervalDays = nextIntervalDays(streak, state.intervalDays, ease);

  return {
    box: Math.min(state.box + 1, MAX_BOX),
    ease,
    intervalDays,
    reps: state.reps + 1,
    streak,
    dueInMinutes: Math.round(intervalDays * MINUTES_PER_DAY),
  };
}

// SM-2: первый верный ответ → 1 день, второй → 3, дальше предыдущий интервал × лёгкость.
function nextIntervalDays(streak: number, prevIntervalDays: number, ease: number): number {
  if (streak <= 1) return 1;
  if (streak === 2) return 3;
  return Math.max(Math.round(prevIntervalDays * ease), 1);
}

/** Классификация по числу повторений и текущему интервалу. */
export function cardStage(state: { reps: number; intervalDays: number }): CardStage {
  if (state.reps === 0) return "new";
  if (state.intervalDays >= MASTERED_INTERVAL_DAYS) return "mastered";
  return "learning";
}
