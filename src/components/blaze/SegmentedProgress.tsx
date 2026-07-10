// Сегментированный прогресс сессии: по сегменту на карточку — отвеченные заливаются,
// текущий пульсирует. Осязаемее сплошной полосы: видно, сколько шагов осталось.
// При большом числе карточек сегменты выродились бы в пыль — деградируем в сплошную полосу.

const MAX_SEGMENTS = 40;

interface SegmentedProgressProps {
  /** Всего шагов (карточек) в сессии. */
  total: number;
  /** Сколько уже отвечено; текущий шаг — следующий за отвеченными. */
  value: number;
}

/** Сегментированная полоса прогресса сессии (сегмент на карточку). */
export function SegmentedProgress({ total, value }: SegmentedProgressProps) {
  if (total <= 0) return null;
  const done = Math.min(Math.max(value, 0), total);

  if (total > MAX_SEGMENTS) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    );
  }

  const segmentClass = (segmentIndex: number): string => {
    if (segmentIndex < done) return "bg-primary";
    if (segmentIndex === done) return "segment-pulse bg-primary";
    return "bg-muted";
  };

  return (
    <div className="flex h-2 w-full gap-1">
      {Array.from({ length: total }, (_, segmentIndex) => (
        <span key={segmentIndex} className={`h-full min-w-0 flex-1 rounded-full ${segmentClass(segmentIndex)}`} />
      ))}
    </div>
  );
}
