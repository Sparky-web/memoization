// Кольцо готовности: честный процент припоминания. Ниже порога слабости — предупреждающий
// цвет, чтобы слабые экзамены и темы бросались в глаза.

const WEAK_THRESHOLD = 0.6;

interface RingSizeConfig {
  box: number;
  stroke: number;
  textClass: string;
}

const ringSizes = {
  sm: { box: 48, stroke: 4, textClass: "text-xs" },
  md: { box: 64, stroke: 5, textClass: "text-sm" },
  lg: { box: 96, stroke: 7, textClass: "text-lg" },
} satisfies Record<string, RingSizeConfig>;

interface ReadinessRingProps {
  /** Готовность 0..1. */
  value: number;
  size?: keyof typeof ringSizes;
}

/** Кольцевой индикатор готовности с процентом внутри. */
export function ReadinessRing({ value, size = "md" }: ReadinessRingProps) {
  const config = ringSizes[size];
  const ratio = Math.min(Math.max(value, 0), 1);
  const radius = (config.box - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcClass = ratio < WEAK_THRESHOLD ? "stroke-warning" : "stroke-success";

  return (
    <div className="relative shrink-0" style={{ width: config.box, height: config.box }}>
      <svg width={config.box} height={config.box} className="-rotate-90" aria-hidden>
        <circle
          cx={config.box / 2}
          cy={config.box / 2}
          r={radius}
          fill="none"
          strokeWidth={config.stroke}
          className="stroke-muted"
        />
        {ratio > 0 && (
          <circle
            cx={config.box / 2}
            cy={config.box / 2}
            r={radius}
            fill="none"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
            className={arcClass}
          />
        )}
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-semibold ${config.textClass}`}>
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );
}
