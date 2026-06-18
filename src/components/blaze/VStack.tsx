import { type HTMLAttributes, type PropsWithChildren } from "react";

import { cn } from "../utils/cn";
import {
  type StackAlignItems,
  stackAlignItemsClasses,
  type StackGap,
  stackGapClasses,
  type StackJustifyContent,
  stackJustifyContentClasses,
} from "../utils/consts";

export interface VStackProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  /** Вдоль колонки (ось Y) — классы `justify-*` */
  align?: StackJustifyContent;
  gap?: StackGap;
  /** Поперёк колонки (ось X) — классы `items-*` */
  justify?: StackAlignItems;
}

export const VStack = ({ children, className, align, gap, justify, ...props }: VStackProps) => {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-col",
        gap && stackGapClasses[gap],
        align && stackJustifyContentClasses[align],
        justify && stackAlignItemsClasses[justify],
        className,
      )}
    >
      {children}
    </div>
  );
};
