import { type InputHTMLAttributes } from "react";

import { cn } from "../utils/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // Без text-sm: размер задаёт глобальное правило app.css (max(16px, 1em)) —
        // поле с computed font-size < 16px iOS зумит при фокусе.
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
