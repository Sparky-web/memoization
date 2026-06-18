import { Link as RouterLink } from "@tanstack/react-router";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps } from "react";

import { cn } from "../utils/cn";

const linkVariants = cva("w-fit", {
  variants: {
    variant: {
      default: "text-foreground hover:text-foreground/85",
      secondary: "text-secondary-foreground hover:text-foreground",
      insideText: "text-primary hover:text-secondary-foreground",
      underline: "text-foreground hover:text-foreground/85 underline underline-offset-4",
    },
  },
  defaultVariants: { variant: "default" },
});

type LinkProps = ComponentProps<typeof RouterLink> & VariantProps<typeof linkVariants>;

/** Стилизованная ссылка поверх роутера TanStack. */
export const Link = ({ className, variant, ...props }: LinkProps) => {
  return <RouterLink className={cn(linkVariants({ variant }), className)} {...props} />;
};
