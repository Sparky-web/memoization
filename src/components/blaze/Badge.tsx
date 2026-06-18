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
    },
  },
  defaultVariants: { variant: "default" },
});

interface BadgeProps extends PropsWithChildren, VariantProps<typeof badgeVariants> {
  className?: string;
}

export function Badge({ children, variant, className }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}
