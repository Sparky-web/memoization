import { type PropsWithChildren } from "react";

interface ChipProps extends PropsWithChildren {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const chipBaseClasses =
  "press inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium " +
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

// В dark у accent-заливки мало контраста с карточкой — активный чип держится на primary-тонах.
const chipStateClasses = {
  active:
    "border-primary/40 bg-accent font-semibold text-accent-foreground dark:border-primary/50 dark:bg-primary/25 dark:text-primary",
  idle: "border-input bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
};

/** Чип-переключатель (формат экзамена, минуты, фильтры, вкладки): пилюля, один из вариантов активен. */
export function Chip({ active, disabled, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      className={`${chipBaseClasses} ${active ? chipStateClasses.active : chipStateClasses.idle}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
