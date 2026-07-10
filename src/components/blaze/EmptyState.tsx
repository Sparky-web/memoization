import { type PropsWithChildren, type ReactNode, type SVGProps } from "react";

import { Heading } from "./Heading";
import { Text } from "./Text";
import { VStack } from "./VStack";

// Пустые состояния: инлайн-SVG-иллюстрации в дуотоне (индиго-контур + светлая заливка).
// Цвета — токенами через классы fill-*/stroke-*, поэтому тёмная тема поддерживается сама.

const ILLUSTRATION_SIZE = 140;

const illustrationSvgProps = {
  width: ILLUSTRATION_SIZE,
  height: ILLUSTRATION_SIZE,
  viewBox: "0 0 140 140",
  fill: "none",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} satisfies SVGProps<SVGSVGElement>;

/** Стопка карточек с искрой — «карточек пока нет». */
function CardsIllustration() {
  return (
    <svg {...illustrationSvgProps}>
      <rect
        x={30}
        y={36}
        width={66}
        height={46}
        rx={10}
        className="fill-accent stroke-primary"
        transform="rotate(-8 63 59)"
      />
      <rect
        x={38}
        y={46}
        width={68}
        height={48}
        rx={10}
        className="fill-card stroke-primary"
        transform="rotate(-2 72 70)"
      />
      <rect
        x={40}
        y={58}
        width={72}
        height={50}
        rx={10}
        className="fill-card stroke-primary"
        transform="rotate(4 76 83)"
      />
      <path d="M54 76 h34" className="stroke-primary/35" />
      <path d="M54 88 h44" className="stroke-primary/35" />
      <circle cx={104} cy={70} r={3} className="fill-primary/30" />
      <path d="M112 26 v14 M105 33 h14" className="stroke-primary" />
      <path d="M26 100 v10 M21 105 h10" className="stroke-primary/50" />
    </svg>
  );
}

/** Календарь с флажком на дате — «на этот день ничего нет». */
function CalendarIllustration() {
  return (
    <svg {...illustrationSvgProps}>
      <rect x={24} y={34} width={92} height={76} rx={12} className="fill-card stroke-primary" />
      <path d="M24 58 v-12 a12 12 0 0 1 12 -12 h68 a12 12 0 0 1 12 12 v12 z" className="fill-accent stroke-primary" />
      <path d="M46 26 v12 M94 26 v12" className="stroke-primary" />
      <circle cx={46} cy={74} r={3} className="fill-primary/30" />
      <circle cx={64} cy={74} r={3} className="fill-primary/30" />
      <circle cx={82} cy={74} r={3} className="fill-primary/30" />
      <circle cx={46} cy={92} r={3} className="fill-primary/30" />
      <circle cx={64} cy={92} r={3} className="fill-primary/30" />
      <path d="M100 96 v-26" className="stroke-primary" />
      <path d="M100 70 c6 -4 10 4 16 0 v12 c-6 4 -10 -4 -16 0 z" className="fill-accent stroke-primary" />
    </svg>
  );
}

/** Спокойная луна со звёздами — bedtime и «на сегодня всё». */
function MoonIllustration() {
  return (
    <svg {...illustrationSvgProps}>
      <path d="M86 32 a40 40 0 1 0 22 50 a34 34 0 0 1 -22 -50 z" className="fill-accent stroke-primary" />
      <path d="M104 30 v12 M98 36 h12" className="stroke-primary" />
      <path d="M118 58 v8 M114 62 h8" className="stroke-primary/50" />
      <circle cx={94} cy={82} r={2.5} className="fill-primary/40" />
      <circle cx={54} cy={62} r={3} className="fill-card" />
      <circle cx={66} cy={84} r={4} className="fill-card" />
    </svg>
  );
}

/** Карта связей: узлы и пунктирные рёбра — «карт пока нет». */
function MapIllustration() {
  return (
    <svg {...illustrationSvgProps}>
      <path d="M46 50 L96 42" className="stroke-primary/40" strokeDasharray="1 7" />
      <path d="M42 54 L66 88" className="stroke-primary/40" strokeDasharray="1 7" />
      <path d="M96 46 L74 90" className="stroke-primary/40" strokeDasharray="1 7" />
      <path d="M78 96 L102 92" className="stroke-primary/40" strokeDasharray="1 7" />
      <circle cx={38} cy={52} r={11} className="fill-card stroke-primary" />
      <circle cx={100} cy={40} r={11} className="fill-accent stroke-primary" />
      <circle cx={70} cy={96} r={11} className="fill-card stroke-primary" />
      <circle cx={110} cy={92} r={7} className="fill-card stroke-primary" />
      <circle cx={100} cy={40} r={3.5} className="fill-primary/40" />
    </svg>
  );
}

const illustrations = {
  cards: CardsIllustration,
  calendar: CalendarIllustration,
  moon: MoonIllustration,
  map: MapIllustration,
};
type EmptyStateIllustration = keyof typeof illustrations;

interface EmptyStateProps extends PropsWithChildren {
  illustration: EmptyStateIllustration;
  /** Заголовок; кириллицу оборачивает в typo() вызывающая сторона. */
  title: string;
  /** Тёплый вторичный текст под заголовком. */
  text?: string;
  /** Слот CTA — обычно одна кнопка. */
  children?: ReactNode;
}

/** Пустое состояние: дуотон-иллюстрация, тёплый текст и один CTA. */
export function EmptyState({ illustration, title, text, children }: EmptyStateProps) {
  const Illustration = illustrations[illustration];
  return (
    <VStack gap="lg" justify="center" className="px-4 py-10 text-center">
      <Illustration />
      <VStack gap="2xs" justify="center" className="max-w-sm">
        <Heading variant="h3" asParagraph align="center">
          {title}
        </Heading>
        {text && (
          <Text variant="small" color="supplementary" align="center">
            {text}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  );
}
