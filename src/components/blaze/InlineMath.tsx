import { renderToString } from "katex";
import { Fragment, type ReactNode } from "react";

import { typo } from "~/lib";

// Разбор строки на сегменты «текст / формула». Нужен там, где нельзя гнать текст через
// markdown: cloze-пропуск «___» remark-gfm превратил бы в подчёркивание/emphasis, а ответы
// закрытых карточек — короткие литералы. Здесь текст остаётся литеральным (с «___» и любыми
// символами), а `$…$`/`$$…$$` рендерятся KaTeX.
interface MathSegment {
  kind: "math";
  expr: string;
  display: boolean;
}
interface TextSegment {
  kind: "text";
  text: string;
}
type Segment = MathSegment | TextSegment;

// Экранированный `\$` — это литеральный знак доллара, не начало формулы. Плейсхолдер
// (символ вне BMP, в математике не встречается) выводит его из-под разбора и возвращается назад.
const ESCAPED_DOLLAR = "\u{1F4B2}";

// Сначала `$$…$$` (выключная формула), затем `$…$` (строчная). Нежадный захват, чтобы
// соседние формулы в одной строке не слиплись в одну.
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function splitSegments(source: string): Segment[] {
  const guarded = source.replaceAll("\\$", ESCAPED_DOLLAR);
  const segments: Segment[] = [];
  let lastIndex = 0;

  const pushText = (raw: string) => {
    if (!raw) return;
    segments.push({ kind: "text", text: raw.replaceAll(ESCAPED_DOLLAR, "$") });
  };

  for (const match of guarded.matchAll(MATH_PATTERN)) {
    const start = match.index;
    pushText(guarded.slice(lastIndex, start));
    const displayExpr = match[1];
    const inlineExpr = match[2];
    if (displayExpr !== undefined) {
      segments.push({ kind: "math", expr: displayExpr.replaceAll(ESCAPED_DOLLAR, "$"), display: true });
    } else if (inlineExpr !== undefined) {
      segments.push({ kind: "math", expr: inlineExpr.replaceAll(ESCAPED_DOLLAR, "$"), display: false });
    }
    lastIndex = start + match[0].length;
  }
  pushText(guarded.slice(lastIndex));
  return segments;
}

interface InlineMathProps {
  children: string;
  /** Обёртке (например, токен-размер/цвет текста). */
  className?: string;
  /** Применять `typo()` (NBSP) к текстовым сегментам. По умолчанию да. */
  applyTypo?: boolean;
}

/**
 * Рендер строки с формулами `$…$`/`$$…$$` БЕЗ markdown: текст — литерально (сохраняя «___»
 * и спецсимволы), математика — через KaTeX. Для cloze-промптов и коротких ответов, где
 * markdown-парсер испортил бы содержимое. Полноценный markdown (списки, таблицы) — `MarkdownView`.
 */
export function InlineMath({ children, className, applyTypo = true }: InlineMathProps) {
  const segments = splitSegments(children);
  const nodes: ReactNode[] = segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <Fragment key={index}>{applyTypo ? typo(segment.text) : segment.text}</Fragment>;
    }
    // throwOnError:false — битая формула не роняет экран, KaTeX сам покажет её красным.
    // dangerouslySetInnerHTML только для вывода KaTeX (доверенный рендер формулы), не для пользовательского HTML.
    const html = renderToString(segment.expr, { throwOnError: false, displayMode: segment.display });
    if (segment.display) {
      return <span key={index} className="katex-inline-display" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  });
  return <span className={className}>{nodes}</span>;
}
