import Markdown from "react-markdown";

interface MarkdownViewProps {
  children: string;
}

/** Рендер markdown-текста (глубокий ответ карточки). Стили — класс .markdown в app.css. */
export function MarkdownView({ children }: MarkdownViewProps) {
  return (
    <div className="markdown">
      <Markdown>{children}</Markdown>
    </div>
  );
}
