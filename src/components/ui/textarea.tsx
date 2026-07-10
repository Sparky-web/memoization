import { type TextareaHTMLAttributes } from "react";

import { cn } from "../utils/cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        // Без text-sm: размер задаёт глобальное правило app.css (max(16px, 1em)) —
        // поле с computed font-size < 16px iOS зумит при фокусе.
        "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
