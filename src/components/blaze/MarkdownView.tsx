import { type ComponentProps } from "react";
import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

interface MarkdownViewProps {
  children: string;
  /**
   * «prompt» — вопрос-«сцена» плеера: первый абзац в масштабе Heading h3 (класс .markdown-prompt).
   * «inline» — короткий текст в масштабе окружения (строки карточек, списки вопросов):
   * абзацы без внешних отступов, размер шрифта наследуется от родителя.
   */
  variant?: "default" | "prompt" | "inline";
  /** Дополнительные классы обёртки (например, токен-размер текста для inline-варианта). */
  className?: string;
}

// Поддержка математики и таблиц: remark-math парсит $…$ и $$…$$, rehype-katex рендерит формулы
// (katex CSS подключён глобально в app.css), remark-gfm добавляет таблицы/зачёркивание/автоссылки.
const remarkPlugins = [remarkMath, remarkGfm];
const rehypePlugins = [rehypeKatex];

// Таблица оборачивается в прокручиваемый контейнер: широкая таблица на мобиле
// скроллится горизонтально, а не распирает карточку.
function ScrollableTable(props: ComponentProps<"table">) {
  return (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  );
}

const markdownComponents = { table: ScrollableTable };

const VARIANT_CLASSES: Record<NonNullable<MarkdownViewProps["variant"]>, string> = {
  default: "markdown",
  prompt: "markdown markdown-prompt",
  inline: "markdown markdown-inline",
};

/** Рендер markdown-текста с формулами ($…$/$$…$$) и таблицами. Стили — класс .markdown в app.css + katex CSS. */
export function MarkdownView({ children, variant = "default", className }: MarkdownViewProps) {
  const variantClasses = VARIANT_CLASSES[variant];
  return (
    <div className={className ? `${variantClasses} ${className}` : variantClasses}>
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
        {children}
      </Markdown>
    </div>
  );
}
