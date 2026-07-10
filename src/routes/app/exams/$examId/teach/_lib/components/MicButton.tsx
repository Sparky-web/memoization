import { Mic } from "lucide-react";
import { type RefObject, useCallback } from "react";

import { typo } from "~/lib";

// Круглая кнопка записи «зажми и говори» с волной-индикатором уровня микрофона.
// Волна — кольцо позади кнопки, масштаб задаёт RAF по амплитуде из AnalyserNode микрофона
// (колбэк-ref с cleanup); при prefers-reduced-motion кольцо статично.

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface MicButtonProps {
  recording: boolean;
  disabled: boolean;
  micAnalyserRef: RefObject<AnalyserNode | null>;
  onPressStart: () => void;
  onPressEnd: () => void;
  /**
   * Уход со страницы во время записи — глушим микрофон без отправки.
   * ВАЖНО: функция обязана быть стабильной (abortRecording из useVoiceRecorder такая),
   * иначе cleanup колбэк-ref'а сработает на каждом рендере и оборвёт живую запись.
   */
  onUnmount: () => void;
}

export function MicButton({ recording, disabled, micAnalyserRef, onPressStart, onPressEnd, onUnmount }: MicButtonProps) {
  // Волна уровня микрофона: средний уровень спектра масштабирует кольцо позади кнопки.
  const attachWave = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node || reducedMotion()) return undefined;
      const spectrum = new Uint8Array(128);
      let frame = 0;
      const tick = () => {
        const analyser = micAnalyserRef.current;
        if (analyser) {
          analyser.getByteFrequencyData(spectrum);
          let sum = 0;
          for (const value of spectrum) sum += value;
          const level = sum / spectrum.length / 255;
          node.style.transform = `scale(${(1 + level * 0.9).toFixed(3)})`;
          node.style.opacity = (0.25 + level * 0.6).toFixed(3);
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(frame);
      };
    },
    [micAnalyserRef],
  );

  // Cleanup на размонтирование — гарантированная точка «страницу покинули во время записи».
  const attachLifecycle = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      return () => {
        onUnmount();
      };
    },
    [onUnmount],
  );

  return (
    <div ref={attachLifecycle} className="relative flex items-center justify-center">
      {recording && (
        <span ref={attachWave} className="teach-mic-wave absolute inset-0 rounded-full bg-primary/30" aria-hidden />
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={recording ? typo("Отпустите, чтобы отправить") : typo("Зажмите и говорите")}
        className={`relative flex size-16 items-center justify-center rounded-full text-primary-foreground transition-colors select-none disabled:opacity-50 ${recording ? "bg-destructive" : "bg-primary"}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onPressStart();
        }}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        <Mic className="size-7" />
      </button>
    </div>
  );
}
