import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

interface MarkdownViewProps {
  children: string;
}

// Поддержка математики: remark-math парсит $…$ и $$…$$, rehype-katex рендерит формулы (нужен katex CSS).
const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];

/** Рендер markdown-текста с формулами. Стили — класс .markdown в app.css + katex CSS. */
export function MarkdownView({ children }: MarkdownViewProps) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {children}
      </Markdown>
    </div>
  );
}
