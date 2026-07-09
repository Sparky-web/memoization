interface LoadMoreSentinelProps {
  /** Вызывается, когда «маяк» попадает в зону видимости (с запасом 400px). */
  onVisible: () => void;
}

/**
 * «Маяк» бесконечной прокрутки. Наблюдатель живёт в ref-колбэке с cleanup (React 19) —
 * без useEffect (запрещён правилами). Колбэк пересоздаётся на каждый рендер, поэтому
 * замыкание всегда видит свежие onVisible и состояние запроса родителя.
 */
export function LoadMoreSentinel({ onVisible }: LoadMoreSentinelProps) {
  return (
    <div
      className="h-px"
      ref={(node) => {
        if (!node) return undefined;
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) onVisible();
          },
          { rootMargin: "400px" },
        );
        observer.observe(node);
        return () => {
          observer.disconnect();
        };
      }}
    />
  );
}
