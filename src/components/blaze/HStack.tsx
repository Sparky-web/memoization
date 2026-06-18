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

export interface HStackProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  align?: StackAlignItems;
  gap?: StackGap;
  justify?: StackJustifyContent;
  /** Перенос на новую строку (`flex-wrap`). */
  wrap?: boolean;
}

export const HStack = ({ children, className, align, gap, justify, wrap, ...props }: HStackProps) => {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-row",
        wrap && "flex-wrap",
        gap && stackGapClasses[gap],
        align && stackAlignItemsClasses[align],
        justify && stackJustifyContentClasses[justify],
        className,
      )}
    >
      {children}
    </div>
  );
};
