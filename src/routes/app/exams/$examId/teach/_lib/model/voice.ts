import { useRef, useState } from "react";

import { zodRussian } from "~/lib";

// Голосовой слой клиента: запись MediaRecorder → /api/speech/stt и озвучка ответа
// через /api/speech/tts. Оба хука отдают AnalyserNode через ref — анимации (волна записи,
// эквалайзер речи) читают амплитуду по requestAnimationFrame в колбэк-ref'ах компонентов.
// Управление жизненным циклом — стабильные контроллеры, созданные один раз (useEffect запрещён):
// их методы безопасно дёргать из обработчиков событий и cleanup'ов колбэк-ref'ов.

const sttResponseSchema = zodRussian.object({ text: zodRussian.string() });
const errorResponseSchema = zodRussian.object({ error: zodRussian.string() });

async function readErrorMessage(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = errorResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.error : "SPEECH_FAILED";
}

/** Пользователь может наговорить не больше лимита STT (≤ 1 МБ ≈ 30 секунд opus). */
const MAX_RECORD_MS = 30_000;
const MAX_STT_BYTES = 1024 * 1024;

// Firefox/Safari умеют ogg-opus; Chrome пишет webm-opus — сервер передаст формат SpeechKit.
function pickRecorderMime(): string {
  const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

interface RecorderSession {
  stream: MediaStream;
  recorder: MediaRecorder;
  audioContext: AudioContext;
  chunks: Blob[];
  /** Запись отменена (уход со страницы) — blob не отправляем. */
  aborted: boolean;
  stopTimer: number;
}

interface VoiceRecorderHandlers {
  onTranscript: (text: string) => void;
  onError: (code: string) => void;
}

/**
 * Запись реплики с микрофона по зажатой кнопке: startRecording по pointerdown,
 * stopRecording по pointerup, abortRecording — стабильная функция для cleanup'а
 * колбэк-ref'а кнопки (глушит микрофон при уходе со страницы без отправки).
 */
export function useVoiceRecorder(handlers: VoiceRecorderHandlers) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  // Контроллер создаётся один раз: замыкает только стабильные значения (setState, ref),
  // свежие колбэки приходят параметрами start() из обработчика события.
  const [controller] = useState(() => {
    let session: RecorderSession | null = null;

    const release = (finished: RecorderSession) => {
      window.clearTimeout(finished.stopTimer);
      for (const track of finished.stream.getTracks()) track.stop();
      void finished.audioContext.close().catch(() => undefined);
      if (session === finished) session = null;
      micAnalyserRef.current = null;
      setRecording(false);
    };

    const start = async (onAudio: (blob: Blob) => void, onError: (code: string) => void) => {
      if (session) return;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        onError("MIC_DENIED");
        return;
      }

      const mimeType = pickRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      // Анализатор микрофона — источник амплитуды для волны-индикатора у кнопки.
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      const active: RecorderSession = {
        stream,
        recorder,
        audioContext,
        chunks: [],
        aborted: false,
        // Страховка от «залипшей» кнопки: дольше лимита не пишем.
        stopTimer: window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, MAX_RECORD_MS),
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size) active.chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(active.chunks, { type });
        const aborted = active.aborted;
        release(active);
        if (!aborted && blob.size) onAudio(blob);
      };

      session = active;
      recorder.start();
      setRecording(true);
    };

    const stop = () => {
      if (session && session.recorder.state !== "inactive") session.recorder.stop();
    };

    const abort = () => {
      if (!session) return;
      session.aborted = true;
      if (session.recorder.state !== "inactive") {
        session.recorder.stop();
        return;
      }
      release(session);
    };

    return { start, stop, abort };
  });

  const sendToStt = async (blob: Blob) => {
    if (blob.size > MAX_STT_BYTES) {
      handlers.onError("TOO_LONG");
      return;
    }
    setTranscribing(true);
    try {
      const response = await fetch("/api/speech/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/ogg" },
        body: blob,
      });
      if (!response.ok) {
        handlers.onError(await readErrorMessage(response));
        return;
      }
      const payload: unknown = await response.json();
      const parsed = sttResponseSchema.safeParse(payload);
      if (!parsed.success || !parsed.data.text.trim()) {
        handlers.onError("SPEECH_FAILED");
        return;
      }
      handlers.onTranscript(parsed.data.text.trim());
    } catch {
      handlers.onError("NETWORK");
    } finally {
      setTranscribing(false);
    }
  };

  // Свежие handlers замыкаются в момент нажатия кнопки — рефы «последнего колбэка» не нужны.
  const startRecording = () =>
    controller.start(
      (blob) => {
        void sendToStt(blob);
      },
      (code) => {
        handlers.onError(code);
      },
    );

  return {
    recording,
    transcribing,
    micAnalyserRef,
    startRecording,
    stopRecording: controller.stop,
    abortRecording: controller.abort,
  };
}

interface PlaybackSession {
  audio: HTMLAudioElement;
  audioContext: AudioContext;
  objectUrl: string;
}

/** Озвучка реплики ученика: TTS-запрос → Audio + AnalyserNode для эквалайзера аватара. */
export function useSpeechPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);

  // Контроллер один на компонент: stopPlayback стабилен — годится для cleanup'а колбэк-ref'а.
  const [controller] = useState(() => {
    let current: PlaybackSession | null = null;

    const stop = () => {
      if (current) {
        current.audio.pause();
        void current.audioContext.close().catch(() => undefined);
        URL.revokeObjectURL(current.objectUrl);
      }
      current = null;
      voiceAnalyserRef.current = null;
      setSpeaking(false);
    };

    const play = async (blob: Blob) => {
      stop();
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      current = { audio, audioContext, objectUrl };
      voiceAnalyserRef.current = analyser;
      audio.onended = stop;
      audio.onerror = stop;
      setSpeaking(true);
      try {
        await audio.play();
      } catch {
        stop();
      }
    };

    return { play, stop };
  });

  // Ошибки озвучки глотаем: текст ответа уже на экране, голос — прогрессивное улучшение.
  const playText = async (text: string) => {
    controller.stop();
    try {
      const response = await fetch("/api/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 500) }),
      });
      if (!response.ok) return;
      await controller.play(await response.blob());
    } catch {
      controller.stop();
    }
  };

  return { speaking, voiceAnalyserRef, playText, stopPlayback: controller.stop };
}
