import { useState } from "react";

import { useMountEffect } from "./useMountEffect";

// Тема живёт в localStorage («light»/«dark») и в классе dark на <html>; до гидрации класс
// выставляет inline-скрипт в __root.tsx. Хук читает фактическое состояние после монтирования
// (SSR-безопасно: на сервере считаем тему светлой).

/** Текущая тема приложения и переключатель светлая/тёмная. */
export function useTheme(): { isDark: boolean; setDark: (dark: boolean) => void } {
  const [isDark, setIsDark] = useState(false);

  useMountEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  });

  const setDark = (dark: boolean) => {
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  return { isDark, setDark };
}
