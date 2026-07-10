import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

interface MarkdownViewProps {
  children: string;
  /** «prompt» — вопрос-«сцена» плеера: первый абзац в масштабе Heading h3 (класс .markdown-prompt). */
  variant?: "default" | "prompt";
}

// Поддержка математики: remark-math парсит $…$ и $$…$$, rehype-katex рендерит формулы (нужен katex CSS).
const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];

/** Рендер markdown-текста с формулами. Стили — класс .markdown в app.css + katex CSS. */
export function MarkdownView({ children, variant = "default" }: MarkdownViewProps) {
  return (
    <div className={variant === "prompt" ? "markdown markdown-prompt" : "markdown"}>
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {children}
      </Markdown>
    </div>
  );
}
