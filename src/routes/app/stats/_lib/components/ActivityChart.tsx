import { HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

import type { ActivityPoint } from "../model/statsQueries";

interface ActivityChartProps {
  points: ActivityPoint[];
}

// Подпись даты столбика: из ключа «YYYY-MM-DD» делаем «DD.MM».
function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day ?? ""}.${month ?? ""}`;
}

export function ActivityChart({ points }: ActivityChartProps) {
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <VStack gap="sm">
      <Text variant="small" color="supplementary">
        {typo("Активность за 14 дней")}
      </Text>
      <VStack gap="2xs">
        <HStack gap="2xs" align="end" className="h-32">
          {points.map((point) => (
            <div
              key={point.date}
              className="flex h-full flex-1 flex-col justify-end overflow-hidden rounded bg-muted"
              title={`${formatDayLabel(point.date)}: ${point.count}`}
            >
              <div className="w-full rounded bg-primary" style={{ height: `${(point.count / maxCount) * 100}%` }} />
            </div>
          ))}
        </HStack>
        {firstPoint && lastPoint && (
          <HStack justify="between">
            <Text variant="mini" color="supplementary">
              {formatDayLabel(firstPoint.date)}
            </Text>
            <Text variant="mini" color="supplementary">
              {typo(`сегодня, ${formatDayLabel(lastPoint.date)}`)}
            </Text>
          </HStack>
        )}
      </VStack>
    </VStack>
  );
}
