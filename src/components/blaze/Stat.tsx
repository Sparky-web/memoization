import { type ReactNode } from "react";

import { Heading } from "./Heading";
import { Text } from "./Text";
import { VStack } from "./VStack";

interface StatProps {
  /** Подпись метрики; кириллицу оборачивает в typo() вызывающая сторона. */
  label: string;
  value: ReactNode;
  hint?: string;
}

/** Плитка метрики для дашборда и статистики. */
export function Stat({ label, value, hint }: StatProps) {
  return (
    <VStack gap="2xs" className="bg-card rounded-2xl p-4">
      <Text variant="small" color="supplementary">
        {label}
      </Text>
      <Heading variant="h2">{value}</Heading>
      {hint && (
        <Text variant="mini" color="supplementary">
          {hint}
        </Text>
      )}
    </VStack>
  );
}
