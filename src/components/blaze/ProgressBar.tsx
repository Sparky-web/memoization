const toneClasses = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
};

interface ProgressBarProps {
  /** Доля 0..1. */
  value: number;
  /** Семантический цвет заполнения; по умолчанию — фирменный. */
  tone?: keyof typeof toneClasses;
}

/** Тонкая полоса прогресса на токенах темы; значение клампится в 0..1. */
export function ProgressBar({ value, tone = "primary" }: ProgressBarProps) {
  const ratio = Math.min(Math.max(value, 0), 1);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${toneClasses[tone]}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
