interface ProgressBarProps {
  /** Доля 0..1. */
  value: number;
}

/** Тонкая полоса прогресса на токенах темы; значение клампится в 0..1. */
export function ProgressBar({ value }: ProgressBarProps) {
  const ratio = Math.min(Math.max(value, 0), 1);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
