import { HStack, SimpleCard, Text, VStack } from "~/components";

interface DailyBarChartProps {
  title: string;
  points: { date: string; value: number }[];
  /** Подпись значения (штуки/деньги) для тултипа и суммы в заголовке. */
  formatValue: (value: number) => string;
}

// Подпись даты столбика: из ключа «YYYY-MM-DD» делаем «DD.MM» (как в ActivityChart статистики).
function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day ?? ""}.${month ?? ""}`;
}

/** Бар-чарт по дням на div-ах: заголовок с суммой за период, столбики, подписи краёв. */
export function DailyBarChart({ title, points, formatValue }: DailyBarChartProps) {
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <SimpleCard>
      <VStack gap="sm">
        <HStack justify="between" align="center" gap="sm">
          <Text variant="small" color="supplementary">
            {title}
          </Text>
          <Text variant="small" bold>
            {formatValue(total)}
          </Text>
        </HStack>
        <VStack gap="2xs">
          <HStack gap="3xs" align="end" className="h-32">
            {points.map((point) => (
              <div
                key={point.date}
                className="flex h-full flex-1 flex-col justify-end overflow-hidden rounded bg-muted"
                title={`${formatDayLabel(point.date)}: ${formatValue(point.value)}`}
              >
                <div className="w-full rounded bg-primary" style={{ height: `${(point.value / maxValue) * 100}%` }} />
              </div>
            ))}
          </HStack>
          {firstPoint && lastPoint && (
            <HStack justify="between">
              <Text variant="mini" color="supplementary">
                {formatDayLabel(firstPoint.date)}
              </Text>
              <Text variant="mini" color="supplementary">
                {formatDayLabel(lastPoint.date)}
              </Text>
            </HStack>
          )}
        </VStack>
      </VStack>
    </SimpleCard>
  );
}
