import { useSyncExternalStore } from "react";

/** Реактивный matchMedia без useEffect. На сервере возвращает false (мобильная ветка по умолчанию). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => {
        list.removeEventListener("change", onStoreChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
