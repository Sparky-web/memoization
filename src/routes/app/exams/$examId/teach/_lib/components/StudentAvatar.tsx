import { type ReactNode, type RefObject, useCallback } from "react";

import { typo } from "~/lib";

// Аватар-ученик с четырьмя состояниями: idle («дыхание»), listening (кольца записи),
// thinking (прыгающие точки), speaking (эквалайзер по реальной амплитуде озвучки).
// Все анимации — CSS; амплитуду эквалайзера пишет requestAnimationFrame в колбэк-ref
// с cleanup (useEffect запрещён правилами). prefers-reduced-motion — статичные версии.

export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

const EQUALIZER_BARS = 5;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * RAF-цикл поверх детей контейнера: колбэк получает амплитуды частотных корзин 0..1
 * и раскладывает их по элементам. Возвращаемый cleanup гасит цикл при размонтировании.
 */
function startAmplitudeLoop(
  container: HTMLElement,
  analyserRef: RefObject<AnalyserNode | null>,
  apply: (bars: HTMLElement[], levels: number[]) => void,
): () => void {
  const bars: HTMLElement[] = [];
  for (const child of container.children) {
    if (child instanceof HTMLElement) bars.push(child);
  }
  const spectrum = new Uint8Array(128);
  let frame = 0;
  const tick = () => {
    const analyser = analyserRef.current;
    if (analyser) {
      analyser.getByteFrequencyData(spectrum);
      const levels = bars.map((_, index) => {
        // Берём низ/середину спектра — там живёт голос; края почти пустые.
        const bucket = spectrum[2 + index * 4] ?? 0;
        return bucket / 255;
      });
      apply(bars, levels);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
  };
}

function ThinkingDots() {
  return (
    <div className="teach-state-enter flex items-center gap-1" aria-label={typo("Ученик думает")}>
      <span className="teach-dot size-1.5 rounded-full bg-primary" />
      <span className="teach-dot teach-dot-2 size-1.5 rounded-full bg-primary" />
      <span className="teach-dot teach-dot-3 size-1.5 rounded-full bg-primary" />
    </div>
  );
}

function Equalizer({ analyserRef }: { analyserRef: RefObject<AnalyserNode | null> }) {
  // Стабильный колбэк-ref: инлайновый пересоздавался бы каждый рендер и перезапускал цикл.
  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container || reducedMotion()) return undefined;
      return startAmplitudeLoop(container, analyserRef, (bars, levels) => {
        bars.forEach((bar, index) => {
          const level = levels[index] ?? 0;
          bar.style.transform = `scaleY(${(0.2 + level * 0.8).toFixed(3)})`;
        });
      });
    },
    [analyserRef],
  );

  return (
    <div ref={attach} className="teach-state-enter flex h-5 items-end gap-0.5" aria-label={typo("Ученик говорит")}>
      {Array.from({ length: EQUALIZER_BARS }, (_, index) => (
        <span key={index} className="teach-bar h-full w-1 rounded-full bg-primary" style={{ transform: "scaleY(0.25)" }} />
      ))}
    </div>
  );
}

const STATE_INDICATORS: Record<AvatarState, (analyserRef: RefObject<AnalyserNode | null>) => ReactNode> = {
  idle: () => null,
  listening: () => null,
  thinking: () => <ThinkingDots />,
  speaking: (analyserRef) => <Equalizer analyserRef={analyserRef} />,
};

interface StudentAvatarProps {
  state: AvatarState;
  /** Анализатор воспроизводимой озвучки — амплитуда эквалайзера в состоянии speaking. */
  voiceAnalyserRef: RefObject<AnalyserNode | null>;
}

/** Аватар ученика: эмодзи-кружок + индикатор состояния под ним. */
export function StudentAvatar({ state, voiceAnalyserRef }: StudentAvatarProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex size-14 items-center justify-center">
        {state === "listening" && (
          <>
            <span className="teach-ring absolute inset-0 rounded-full border-2 border-primary" />
            <span className="teach-ring teach-ring-late absolute inset-0 rounded-full border-2 border-primary" />
          </>
        )}
        <span
          className={`flex size-12 items-center justify-center rounded-full bg-accent text-2xl ${state === "idle" ? "teach-avatar-idle" : ""}`}
          role="img"
          aria-label={typo("Ученик")}
        >
          🧑‍🎓
        </span>
      </div>
      <div className="flex h-5 items-center">{STATE_INDICATORS[state](voiceAnalyserRef)}</div>
    </div>
  );
}
