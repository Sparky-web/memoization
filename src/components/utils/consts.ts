// Семантические токены раскладки и типографики для компонентов библиотеки.
// Без `as const` (запрещён правилами): литеральные значения там, где нужны — через явные
// аннотации; для карт классов хватает вывода `keyof typeof`.

export type Size = "xs" | "sm" | "md" | "lg";
export const Size: { xs: "xs"; sm: "sm"; md: "md"; lg: "lg" } = { xs: "xs", sm: "sm", md: "md", lg: "lg" };

export const stackAlignItemsClasses = {
  start: "items-start",
  end: "items-end",
  center: "items-center",
  stretch: "items-stretch",
  baseline: "items-baseline",
};
export type StackAlignItems = keyof typeof stackAlignItemsClasses;

export const stackJustifyContentClasses = {
  start: "justify-start",
  end: "justify-end",
  center: "justify-center",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
  stretch: "justify-stretch",
};
export type StackJustifyContent = keyof typeof stackJustifyContentClasses;

/** Шаг между элементами стека (Figma spacing → Tailwind gap). */
export const stackGapClasses = {
  "3xs": "gap-0.5",
  "2xs": "gap-1",
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-5",
  xl: "gap-6",
  "2xl": "gap-8",
  "3xl": "gap-8",
  "4xl": "gap-10",
  section: "gap-10",
  "5xl": "gap-12",
};
export type StackGap = keyof typeof stackGapClasses;

/** Семантический цвет текста → класс Tailwind. */
export const textColorClasses = {
  main: "text-foreground",
  supplementary: "text-muted-foreground",
  destructive: "text-destructive",
  primary: "text-primary",
  ochre: "text-ochre",
};
export type TextColor = keyof typeof textColorClasses;

/** Ограничение числа строк (line-clamp). Полные классы — под JIT Tailwind. */
export const maxLinesClasses = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
  7: "line-clamp-[7]",
  8: "line-clamp-[8]",
  9: "line-clamp-[9]",
  10: "line-clamp-[10]",
};
export type MaxLines = keyof typeof maxLinesClasses;

/** Перенос длинных слов и авто-переносы. */
export const breakWordsTypographyClasses = "break-words hyphens-auto";
