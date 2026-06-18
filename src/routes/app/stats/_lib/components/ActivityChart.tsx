import { HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

import type { ActivityPoint } from "../model/statsQueries";

interface ActivityChartProps {
  points: ActivityPoint[];
}

export function ActivityChart({ points }: ActivityChartProps) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));

  return (
    <VStack gap="sm">
      <Text variant="small" color="supplementary">
        {typo("Активность за 14 дней")}
      </Text>
      <HStack gap="2xs" align="end" className="h-32">
        {points.map((point) => (
          <div
            key={point.date}
            className="bg-muted flex h-full flex-1 flex-col justify-end overflow-hidden rounded"
            title={`${point.date}: ${point.count}`}
          >
            <div className="bg-primary w-full rounded" style={{ height: `${(point.count / maxCount) * 100}%` }} />
          </div>
        ))}
      </HStack>
    </VStack>
  );
}
