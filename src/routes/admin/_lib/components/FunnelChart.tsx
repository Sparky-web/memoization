import { HStack, ProgressBar, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { formatNumber } from "../lib/format";

interface FunnelChartProps {
  /** Шаги в порядке воронки; проценты считаются от предыдущего шага. */
  steps: { label: string; count: number }[];
}

/** Воронка конверсии: счётчик шага, процент от предыдущего, полоса — доля от первого шага. */
export function FunnelChart({ steps }: FunnelChartProps) {
  const firstCount = steps[0]?.count ?? 0;

  return (
    <VStack gap="md">
      {steps.map((step, index) => {
        const previousCount = index ? (steps[index - 1]?.count ?? 0) : step.count;
        const conversion = previousCount ? Math.round((step.count / previousCount) * 100) : 0;
        return (
          <VStack key={step.label} gap="3xs">
            <HStack justify="between" align="center" gap="sm">
              <Text variant="small">{step.label}</Text>
              <Text variant="small" color="supplementary">
                {index
                  ? typo(`${formatNumber(step.count)} · ${conversion}% от предыдущего шага`)
                  : formatNumber(step.count)}
              </Text>
            </HStack>
            <ProgressBar value={firstCount ? step.count / firstCount : 0} />
          </VStack>
        );
      })}
    </VStack>
  );
}
