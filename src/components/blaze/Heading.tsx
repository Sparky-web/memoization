import { type PropsWithChildren } from "react";

import { exhaustiveCheck } from "~/lib";

import { cn } from "../utils/cn";
import {
  breakWordsTypographyClasses,
  type MaxLines,
  maxLinesClasses,
  type TextColor,
  textColorClasses,
} from "../utils/consts";

const headingBase = "m-0 font-headings font-semibold text-balance";

const headingAlignClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
  start: "text-start",
  end: "text-end",
};
type HeadingAlign = keyof typeof headingAlignClasses;

type HeadingTagProps = PropsWithChildren<{ className?: string; asParagraph?: boolean }>;

function TypographyH1({ children, className, asParagraph }: HeadingTagProps) {
  const Tag = asParagraph ? "p" : "h1";
  return (
    <Tag
      className={cn(
        headingBase,
        "text-(length:--heading-1-font-size) leading-(--heading-1-line-height) tracking-(--heading-1-letter-spacing)",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

function TypographyH2({ children, className, asParagraph }: HeadingTagProps) {
  const Tag = asParagraph ? "p" : "h2";
  return (
    <Tag
      className={cn(
        headingBase,
        "text-(length:--heading-2-font-size) leading-(--heading-2-line-height) tracking-(--heading-2-letter-spacing)",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

function TypographyH3({ children, className, asParagraph }: HeadingTagProps) {
  const Tag = asParagraph ? "p" : "h3";
  return (
    <Tag
      className={cn(
        headingBase,
        "text-(length:--heading-3-font-size) leading-(--heading-3-line-height) tracking-(--heading-3-letter-spacing)",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

function TypographyH4({ children, className, asParagraph }: HeadingTagProps) {
  const Tag = asParagraph ? "p" : "h4";
  return (
    <Tag
      className={cn(
        headingBase,
        "text-(length:--heading-4-font-size) leading-(--heading-4-line-height) tracking-(--heading-4-letter-spacing)",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

type HeadingVariant = "h1" | "h2" | "h3" | "h4";

interface HeadingProps extends PropsWithChildren {
  variant: HeadingVariant;
  /** Выравнивание текста (`text-*`). */
  align?: HeadingAlign;
  /** Цвет текста. Без значения классы цвета не добавляются. */
  color?: TextColor;
  /** Рендер с теми же стилями, но тегом `p` вместо `h1`–`h4`. */
  asParagraph?: boolean;
  /** Обрезка по числу строк (`line-clamp`), 1–10. */
  maxLines?: MaxLines;
  /** Перенос только слишком длинных слов (`break-words`), без авто-дефисов. */
  breakWords?: boolean;
}

export const Heading = ({ variant, children, align, color, asParagraph, maxLines, breakWords: breakWordsProp }: HeadingProps) => {
  const alignClass = align ? headingAlignClasses[align] : undefined;
  const colorClass = color ? textColorClasses[color] : undefined;
  const maxLinesClass = maxLines !== undefined ? maxLinesClasses[maxLines] : undefined;
  const breakWordsClass = breakWordsProp ? breakWordsTypographyClasses : undefined;
  const propsToPass = { children, asParagraph, className: cn(alignClass, colorClass, maxLinesClass, breakWordsClass) };

  switch (variant) {
    case "h1":
      return <TypographyH1 {...propsToPass} />;
    case "h2":
      return <TypographyH2 {...propsToPass} />;
    case "h3":
      return <TypographyH3 {...propsToPass} />;
    case "h4":
      return <TypographyH4 {...propsToPass} />;
    default:
      return exhaustiveCheck(variant);
  }
};
