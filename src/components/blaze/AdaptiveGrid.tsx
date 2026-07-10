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

/** Числа колонок, для которых в бандле есть готовые классы Tailwind. */
export type GridColumnCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// Полные классы (без сборки строкой) — чтобы Tailwind нашёл их в исходнике.
const gridColsBaseClasses = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
} satisfies Readonly<Record<GridColumnCount, string>>;

const gridColsMdClasses = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
  7: "md:grid-cols-7",
  8: "md:grid-cols-8",
  9: "md:grid-cols-9",
  10: "md:grid-cols-10",
  11: "md:grid-cols-11",
  12: "md:grid-cols-12",
} satisfies Readonly<Record<GridColumnCount, string>>;

const gridColsLgClasses = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
  8: "lg:grid-cols-8",
  9: "lg:grid-cols-9",
  10: "lg:grid-cols-10",
  11: "lg:grid-cols-11",
  12: "lg:grid-cols-12",
} satisfies Readonly<Record<GridColumnCount, string>>;

const gridColsXlClasses = {
  1: "xl:grid-cols-1",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6",
  7: "xl:grid-cols-7",
  8: "xl:grid-cols-8",
  9: "xl:grid-cols-9",
  10: "xl:grid-cols-10",
  11: "xl:grid-cols-11",
  12: "xl:grid-cols-12",
} satisfies Readonly<Record<GridColumnCount, string>>;

export interface AdaptiveGridCols {
  base: GridColumnCount;
  md?: GridColumnCount;
  lg?: GridColumnCount;
  xl?: GridColumnCount;
}

interface ResolvedCols {
  base: GridColumnCount;
  md: GridColumnCount;
  lg: GridColumnCount;
  xl: GridColumnCount;
}

/** Отсутствующий брейкпоинт наследует ближайший слева (base → md → lg → xl). */
function resolveCols(cols: AdaptiveGridCols): ResolvedCols {
  const rMd = cols.md ?? cols.base;
  const rLg = cols.lg ?? rMd;
  const rXl = cols.xl ?? rLg;
  return { base: cols.base, md: rMd, lg: rLg, xl: rXl };
}

function buildGridColsClasses(resolved: ResolvedCols): string {
  return cn(
    gridColsBaseClasses[resolved.base],
    resolved.md !== resolved.base && gridColsMdClasses[resolved.md],
    resolved.lg !== resolved.md && gridColsLgClasses[resolved.lg],
    resolved.xl !== resolved.lg && gridColsXlClasses[resolved.xl],
  );
}

export interface AdaptiveGridProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  /** Число колонок по брейкпоинтам; `md`/`lg`/`xl` опциональны (наследуют предыдущее). */
  cols: AdaptiveGridCols;
  align?: StackAlignItems;
  gap?: StackGap;
  justify?: StackJustifyContent;
}

export const AdaptiveGrid = ({ children, className, cols, align, gap, justify, ...props }: AdaptiveGridProps) => {
  const resolved = resolveCols(cols);
  return (
    <div
      {...props}
      className={cn(
        "grid",
        buildGridColsClasses(resolved),
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
