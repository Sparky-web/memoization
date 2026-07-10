import { cva, type VariantProps } from "class-variance-authority";
import { type PropsWithChildren } from "react";

import { cn } from "../utils/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      primary: "bg-primary text-primary-foreground",
      muted: "bg-muted text-muted-foreground",
      outline: "border border-border text-foreground",
      // Статус «точка+текст»: цвет несёт точка (проп dot), пилюля не заливается — тише и чище.
      dot: "gap-1.5 px-1 py-0.5 text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

/** Цвет точки статуса для variant="dot". */
const dotToneClasses = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  flame: "bg-flame",
  muted: "bg-muted-foreground",
};
type DotTone = keyof typeof dotToneClasses;

interface BadgeProps extends PropsWithChildren, VariantProps<typeof badgeVariants> {
  className?: string;
  /** Тон точки для variant="dot"; вне dot-варианта игнорируется. */
  dot?: DotTone;
}

export function Badge({ children, variant, dot = "muted", className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {variant === "dot" && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotToneClasses[dot])} />}
      {children}
    </span>
  );
}
