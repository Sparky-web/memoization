import { type ReactNode } from "react";

import { Text } from "./Text";
import { VStack } from "./VStack";

interface StatProps {
  /** Подпись метрики; кириллицу оборачивает в typo() вызывающая сторона. */
  label: string;
  value: ReactNode;
  hint?: string;
  /** Центрирование содержимого плитки (герои публичных страниц). */
  align?: "start" | "center";
}

/** Плитка метрики для дашборда и статистики: цифра-герой — крупная, tabular, 800. */
export function Stat({ label, value, hint, align = "start" }: StatProps) {
  return (
    <VStack
      gap="2xs"
      justify={align === "center" ? "center" : undefined}
      className={
        align === "center" ? "rounded-2xl bg-card p-4 text-center shadow-card" : "rounded-2xl bg-card p-4 shadow-card"
      }
    >
      <Text variant="small" color="supplementary">
        {label}
      </Text>
      <p className="m-0 font-headings text-(length:--stat-value-font-size) leading-(--stat-value-line-height) font-extrabold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && (
        <Text variant="mini" color="supplementary">
          {hint}
        </Text>
      )}
    </VStack>
  );
}
