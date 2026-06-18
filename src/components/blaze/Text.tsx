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

const textAlignClasses = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
  start: "text-start",
  end: "text-end",
};
type TextAlign = keyof typeof textAlignClasses;

type TextTagProps = PropsWithChildren<{ className?: string }>;

function TypographyP({ children, className }: TextTagProps) {
  return (
    <p
      className={cn(
        "m-0 font-sans text-(length:--paragraph-regular-font-size) leading-(--paragraph-regular-line-height) font-normal tracking-(--paragraph-regular-letter-spacing)",
        className,
      )}
    >
      {children}
    </p>
  );
}

function TypographyBlockquote({ children, className }: TextTagProps) {
  return (
    <blockquote
      className={cn(
        "m-0 border-l-2 pl-6 font-sans text-(length:--paragraph-regular-font-size) leading-(--paragraph-regular-line-height) font-normal italic",
        className,
      )}
    >
      {children}
    </blockquote>
  );
}

function TypographyInlineCode({ children, className }: TextTagProps) {
  return (
    <code
      className={cn(
        "bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-(length:--monospaced-font-size) leading-(--monospaced-line-height) font-normal tracking-(--monospaced-letter-spacing)",
        className,
      )}
    >
      {children}
    </code>
  );
}

function TypographyLarge({ children, className }: TextTagProps) {
  return (
    <div
      className={cn(
        "m-0 font-sans text-(length:--paragraph-large-font-size) leading-(--paragraph-large-line-height) font-normal tracking-(--paragraph-large-letter-spacing)",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TypographySmall({ children, className }: TextTagProps) {
  return (
    <small
      className={cn(
        "m-0 font-sans text-(length:--paragraph-small-font-size) leading-(--paragraph-small-line-height) font-normal tracking-(--paragraph-small-letter-spacing)",
        className,
      )}
    >
      {children}
    </small>
  );
}

function TypographyMini({ children, className }: TextTagProps) {
  return (
    <small
      className={cn(
        "m-0 font-sans text-(length:--paragraph-mini-font-size) leading-(--paragraph-mini-line-height) font-normal tracking-(--paragraph-mini-letter-spacing)",
        className,
      )}
    >
      {children}
    </small>
  );
}

function TypographyMuted({ children, className }: TextTagProps) {
  return (
    <p
      className={cn(
        "text-muted-foreground m-0 font-sans text-(length:--paragraph-small-font-size) leading-(--paragraph-small-line-height) font-normal tracking-(--paragraph-small-letter-spacing)",
        className,
      )}
    >
      {children}
    </p>
  );
}

type TypographyVariant = "normal" | "large" | "small" | "mini" | "muted" | "code" | "blockquote";

interface TextProps extends PropsWithChildren {
  variant?: TypographyVariant;
  /** Выравнивание текста (`text-*`). */
  align?: TextAlign;
  /** Цвет текста. Без значения классы цвета не добавляются. */
  color?: TextColor;
  /** Полужирное начертание (`font-bold`). */
  bold?: boolean;
  /** Обрезка по числу строк (`line-clamp`), 1–10. */
  maxLines?: MaxLines;
  /** Перенос длинных слов (`break-words`) и `hyphens-auto`. */
  breakWords?: boolean;
}

export const Text = ({ variant = "normal", children, align, color, bold, maxLines, breakWords: breakWordsProp }: TextProps) => {
  const alignClass = align ? textAlignClasses[align] : undefined;
  const colorClass = color ? textColorClasses[color] : undefined;
  const maxLinesClass = maxLines !== undefined ? maxLinesClasses[maxLines] : undefined;
  const breakWordsClass = breakWordsProp ? breakWordsTypographyClasses : undefined;
  const propsToPass = {
    children,
    className: cn(alignClass, colorClass, bold && "font-bold", maxLinesClass, breakWordsClass),
  };

  switch (variant) {
    case "small":
      return <TypographySmall {...propsToPass} />;
    case "mini":
      return <TypographyMini {...propsToPass} />;
    case "normal":
      return <TypographyP {...propsToPass} />;
    case "large":
      return <TypographyLarge {...propsToPass} />;
    case "blockquote":
      return <TypographyBlockquote {...propsToPass} />;
    case "code":
      return <TypographyInlineCode {...propsToPass} />;
    case "muted":
      return <TypographyMuted {...propsToPass} />;
    default:
      return exhaustiveCheck(variant);
  }
};
