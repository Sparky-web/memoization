import { type EffectCallback, useEffect } from "react";

// Единственное санкционированное место использования useEffect (правило no-restricted-imports
// для него отключено в eslint.config.js именно тут). useEffect в прикладном коде запрещён —
// подписки на данные делаем через @tanstack/react-query, а одноразовую инициализацию — здесь.

/** Запускает эффект один раз при монтировании. Возвращаемая функция — очистка при размонтировании. */
export function useMountEffect(effect: EffectCallback): void {
  useEffect(effect, []);
}
