import { type ReactNode, useId } from "react";

import { VStack } from "./VStack";

// Кольцо готовности — главный герой бренда: градиентный штрих (индиго → фиолет), мягкий трек,
// отрисовка от нуля при маунте, крупная tabular-цифра. Ниже порога слабости градиент тёплый
// (янтарный), чтобы слабые экзамены и темы бросались в глаза.

const WEAK_THRESHOLD = 0.6;

// pathLength нормирует длину окружности к 100 — keyframe ring-draw стартует с постоянного значения.
const RING_PATH_LENGTH = 100;

interface RingSizeConfig {
  box: number;
  stroke: number;
  textClass: string;
}

const ringSizes = {
  sm: { box: 48, stroke: 4, textClass: "text-xs" },
  md: { box: 64, stroke: 5, textClass: "text-base" },
  lg: { box: 96, stroke: 7, textClass: "text-2xl" },
} satisfies Record<string, RingSizeConfig>;

interface ReadinessRingProps {
  /** Готовность 0..1. */
  value: number;
  size?: keyof typeof ringSizes;
  /**
   * Подпись под кольцом. Центровка по оси кольца живёт здесь, в компоненте:
   * svg-бокс фиксированной ширины в обычном стеке прижимался бы к краю, а подпись — к центру.
   */
  label?: ReactNode;
}

/** Кольцевой индикатор готовности с процентом внутри. */
export function ReadinessRing({ value, size = "md", label }: ReadinessRingProps) {
  const gradientId = useId();
  const config = ringSizes[size];
  const ratio = Math.min(Math.max(value, 0), 1);
  const radius = (config.box - config.stroke) / 2;
  const weak = ratio < WEAK_THRESHOLD;

  const ring = (
    <div className="relative shrink-0" style={{ width: config.box, height: config.box }}>
      <svg width={config.box} height={config.box} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {weak ? (
              <>
                <stop offset="0%" stopColor="var(--flame)" />
                <stop offset="100%" stopColor="var(--warning)" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--gradient-brand-from)" />
                <stop offset="100%" stopColor="var(--gradient-brand-to)" />
              </>
            )}
          </linearGradient>
        </defs>
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
            stroke={`url(#${gradientId})`}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            pathLength={RING_PATH_LENGTH}
            strokeDasharray={RING_PATH_LENGTH}
            strokeDashoffset={RING_PATH_LENGTH * (1 - ratio)}
            className="ring-draw"
          />
        )}
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-extrabold tracking-tight tabular-nums ${config.textClass}`}
      >
        {Math.round(ratio * 100)}%
      </span>
    </div>
  );

  if (!label) return ring;
  return (
    <VStack gap="3xs" justify="center" className="min-w-0">
      {ring}
      {label}
    </VStack>
  );
}
