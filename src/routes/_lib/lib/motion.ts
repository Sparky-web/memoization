/** Шаг stagger-появления `.rise` (сек): элементы списка выходят друг за другом. */
const RISE_STEP_SECONDS = 0.07;

/** Inline-задержка для `.rise`: по индексу элемента (максимум ~8, дальше без задержки). */
export function riseDelay(index: number): { animationDelay: string } {
  return { animationDelay: `${(index * RISE_STEP_SECONDS).toFixed(2)}s` };
}
