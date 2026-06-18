import { cn } from "../utils/cn";

interface ProgressBarProps {
  /** Доля заполнения 0…1. */
  value: number;
  className?: string;
}

/** Тонкий индикатор прогресса. Ширина — динамическая, поэтому через инлайн-style (санкционированное исключение). */
export function ProgressBar({ value, className }: ProgressBarProps) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)}>
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}
