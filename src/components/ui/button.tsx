import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes } from "react";

import { cn } from "../utils/cn";

// «press» в базе — фирменный отклик нажатия (scale .98) у всех кнопок; transition задаёт он же.
const buttonVariants = cva(
  "press inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Герой экрана: фирменный градиент + подъём. Один такой CTA на экран.
        // В disabled градиент гасится полностью до muted: полупрозрачный градиент читается как «сломано».
        brand:
          "bg-brand-gradient text-brand-foreground shadow-card lift disabled:bg-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-card hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Текстовая ссылка-действие (в строках карточек/футерах) — без фона и подчёркивания
        link: "w-fit font-extrabold text-primary hover:text-primary/80",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3",
        lg: "h-11 px-8",
        pill: "h-12 rounded-full px-7 text-base font-extrabold",
        icon: "size-10",
        // Для variant="link": без отступов и фиксированной высоты
        inline: "h-auto gap-1 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
