import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Lock, Mic, Send, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Heading,
  HStack,
  Input,
  MarkdownView,
  PaywallCard,
  SimpleCard,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { formatDateRuMsk, isPaywallError, typo } from "~/lib";

import { Chip, examQueries } from "../../_lib";
import { MicButton } from "./_lib/components/MicButton";
import { type AvatarState, StudentAvatar } from "./_lib/components/StudentAvatar";
import {
  createTeachSession,
  finishTeachSession,
  sendTeachMessage,
  teachQueries,
  type TeachTurnItem,
} from "./_lib/model/teachModel";
import { useSpeechPlayback, useVoiceRecorder } from "./_lib/model/voice";

// «Объясни ученику»: пользователь объясняет тему ИИ-первокурснику текстом или голосом.
// Проговаривание вслух вскрывает пробелы понимания мгновенно (спека, эффект ≈ 0,56).

export const Route = createFileRoute("/app/exams/$examId/teach/")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(examQueries.detail(params.examId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: typo("Объясни ученику") }] }),
  notFoundComponent: () => (
    <VStack gap="md">
      <Heading variant="h1">{typo("Экзамен не найден")}</Heading>
      <Text color="supplementary">{typo("Ссылка неверна или экзамен удалён.")}</Text>
    </VStack>
  ),
  component: TeachPage,
});

interface ActiveSession {
  id: string;
  topic: string;
  voice: boolean;
}

// Человеческие тексты для кодов голосовых ошибок клиента и сервера.
const VOICE_ERROR_TEXTS: Record<string, string> = {
  MIC_DENIED: typo("Нет доступа к микрофону — разрешите запись в настройках браузера"),
  UNSUPPORTED: typo("Браузер не поддерживает запись голоса — объясняйте текстом"),
  TOO_LONG: typo("Запись слишком длинная — говорите до 30 секунд"),
  NETWORK: typo("Не получилось отправить запись — проверьте сеть"),
  SPEECH_FAILED: typo("Речь не распозналась — попробуйте ещё раз"),
  PAYWALL_VOICE: typo("Голосовой режим доступен в Pro"),
};

function voiceErrorText(code: string): string {
  const known = VOICE_ERROR_TEXTS[code];
  if (known) return known;
  return /[а-яё]/i.test(code) ? typo(code) : typo("Голосовая функция не сработала — продолжите текстом");
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="rise flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-card">
        <Text variant="small" breakWords>
          {content}
        </Text>
      </div>
    </div>
  );
}

function StudentBubble({ content }: { content: string }) {
  return (
    <div className="rise flex items-end justify-start gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-base" aria-hidden>
        🧑‍🎓
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 shadow-card">
        <Text variant="small" breakWords>
          {content}
        </Text>
      </div>
    </div>
  );
}

// Настройка сессии: тема (чипы из тем экзамена или свободное поле) и режим (текст/голос).
function SetupScreen({
  examId,
  onStarted,
}: {
  examId: string;
  onStarted: (session: ActiveSession, greeting: TeachTurnItem) => void;
}) {
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const speech = useQuery(teachQueries.speechStatus());
  const history = useQuery(teachQueries.sessions(examId));

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [showVoicePaywall, setShowVoicePaywall] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const topics = exam.topics.flatMap((entry) => (entry.topic ? [entry.topic] : []));
  const topic = customTopic.trim() || selectedTopic || "";

  const speechConfigured = speech.data?.configured ?? false;
  const speechAllowed = speech.data?.allowed ?? false;

  const create = useMutation({
    mutationFn: () => createTeachSession({ data: { examId, topic, voice: voiceMode } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["teach"] });
      onStarted(
        { id: result.session.id, topic: result.session.topic ?? topic, voice: result.session.voice },
        result.greeting,
      );
    },
    onError: (error) => {
      if (isPaywallError(error, "VOICE")) {
        setShowVoicePaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось начать сессию");
      toast.error(humanMessage);
    },
  });

  const toggleVoice = () => {
    if (voiceMode) {
      setVoiceMode(false);
      return;
    }
    if (!speechAllowed) {
      setShowVoicePaywall(true);
      return;
    }
    setVoiceMode(true);
  };

  const voiceHint = () => {
    if (!speechConfigured) return typo("Голос скоро появится — пока объясняйте текстом");
    if (!speechAllowed) return typo("Голосовой режим — в Pro");
    return typo("Зажмите кнопку записи и объясняйте вслух — как на настоящем экзамене");
  };

  return (
    <VStack gap="lg">
      <VStack gap="2xs">
        <Heading variant="h1">{typo("Объясни ученику")}</Heading>
        <Text color="supplementary">
          {typo(
            "Лучший способ понять — объяснить другому. Ученик наивный, но дотошный: переспрашивает и честно говорит, когда непонятно.",
          )}
        </Text>
      </VStack>

      <SimpleCard size="lg">
        <VStack gap="md">
          <VStack gap="2xs">
            <Text bold>{typo("Что объясняем?")}</Text>
            {topics.length > 0 && (
              <HStack gap="2xs" wrap>
                {topics.map((option) => (
                  <Chip
                    key={option}
                    active={selectedTopic === option && !customTopic.trim()}
                    onClick={() => {
                      setSelectedTopic(option);
                      setCustomTopic("");
                    }}
                  >
                    {typo(option)}
                  </Chip>
                ))}
              </HStack>
            )}
            <Input
              value={customTopic}
              placeholder={typo("Или своя тема — что сегодня разбираем?")}
              onChange={(event) => {
                setCustomTopic(event.target.value);
              }}
            />
          </VStack>

          <VStack gap="2xs">
            <HStack gap="2xs" align="center" wrap>
              <Chip
                active={!voiceMode}
                onClick={() => {
                  setVoiceMode(false);
                }}
              >
                {typo("Текстом")}
              </Chip>
              <Button
                variant={voiceMode ? "secondary" : "outline"}
                size="sm"
                disabled={!speechConfigured}
                onClick={toggleVoice}
              >
                {speechAllowed && speechConfigured ? <Mic className="size-4" /> : <Lock className="size-4" />}
                {typo("Голосом")}
                <Badge variant="primary">Pro</Badge>
              </Button>
            </HStack>
            <Text variant="mini" color="supplementary">
              {voiceHint()}
            </Text>
          </VStack>

          {showVoicePaywall && <PaywallCard reason="VOICE" compact />}

          <HStack>
            <Button
              size="pill"
              variant="brand"
              disabled={!topic || create.isPending}
              onClick={() => {
                create.mutate();
              }}
            >
              {typo("Начать объяснение")}
            </Button>
          </HStack>
        </VStack>
      </SimpleCard>

      {(history.data?.length ?? 0) > 0 && (
        <VStack gap="sm">
          <Heading variant="h4" asParagraph>
            {typo("Прошлые сессии")}
          </Heading>
          {history.data?.map((session) => (
            <SimpleCard key={session.id}>
              <VStack gap="2xs">
                <HStack gap="xs" align="center" wrap>
                  <Text bold breakWords>
                    {typo(session.topic ?? "Без темы")}
                  </Text>
                  {session.voice && <Badge variant="outline">{typo("голосом")}</Badge>}
                  <Text variant="mini" color="supplementary">
                    {typo(`${formatDateRuMsk(new Date(session.createdAt))} · реплик: ${session.turnCount}`)}
                  </Text>
                </HStack>
                {session.summaryMd && (
                  <Button
                    variant="link"
                    size="inline"
                    onClick={() => {
                      setExpandedSessionId((current) => (current === session.id ? null : session.id));
                    }}
                  >
                    {expandedSessionId === session.id ? typo("Скрыть итог") : typo("Показать итог")}
                  </Button>
                )}
                {expandedSessionId === session.id && session.summaryMd && (
                  <MarkdownView>{session.summaryMd}</MarkdownView>
                )}
              </VStack>
            </SimpleCard>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

function avatarStateOf(input: { speaking: boolean; thinking: boolean; listening: boolean }): AvatarState {
  if (input.speaking) return "speaking";
  if (input.thinking) return "thinking";
  if (input.listening) return "listening";
  return "idle";
}

// Диалог с учеником: лента реплик, ввод текстом и голосом, «Завершить» → итог.
function DialogScreen({
  session,
  initialTurns,
  onSummary,
  onExit,
}: {
  session: ActiveSession;
  initialTurns: TeachTurnItem[];
  onSummary: (summaryMd: string) => void;
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<TeachTurnItem[]>(initialTurns);
  const [text, setText] = useState("");

  const playback = useSpeechPlayback();
  const send = useMutation({
    mutationFn: (content: string) => sendTeachMessage({ data: { sessionId: session.id, content } }),
    onSuccess: (result) => {
      setTurns((current) => [...current, result.userTurn, result.studentTurn]);
      // Ответ ученика приходит текстом и озвучивается (голосовой режим, Pro).
      if (session.voice) void playback.playText(result.studentTurn.content);
    },
    onError: (error) => {
      if (isPaywallError(error, "CHAT")) return;
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось отправить объяснение");
      toast.error(humanMessage);
    },
  });

  const recorder = useVoiceRecorder({
    onTranscript: (transcript) => {
      send.mutate(transcript);
    },
    onError: (code) => {
      toast.error(voiceErrorText(code));
    },
  });

  const finish = useMutation({
    mutationFn: () => finishTeachSession({ data: { sessionId: session.id } }),
    onSuccess: (result) => {
      playback.stopPlayback();
      void queryClient.invalidateQueries({ queryKey: ["teach"] });
      onSummary(result.summaryMd);
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось подвести итог");
      toast.error(humanMessage);
    },
  });

  // Остановка озвучки при уходе со страницы: stopPlayback стабилен, поэтому cleanup
  // колбэк-ref'а сработает только на размонтирование, а не на каждом рендере.
  const stopPlayback = playback.stopPlayback;
  const attachRoot = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return undefined;
      return () => {
        stopPlayback();
      };
    },
    [stopPlayback],
  );

  const sendTyped = () => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    send.mutate(trimmed);
    setText("");
  };

  const avatarState = avatarStateOf({
    speaking: playback.speaking,
    thinking: send.isPending || recorder.transcribing,
    listening: recorder.recording,
  });

  const hasUserTurn = turns.some((turn) => turn.role === "user") || send.isPending;

  return (
    <div ref={attachRoot}>
      <VStack gap="md">
        <HStack justify="between" align="center" gap="md">
          <VStack gap="3xs">
            <Heading variant="h3" asParagraph breakWords>
              {typo(session.topic)}
            </Heading>
            <Text variant="mini" color="supplementary">
              {session.voice
                ? typo("Голосовой режим · ученик слушает")
                : typo("Объясняйте своими словами — ученик переспросит")}
            </Text>
          </VStack>
          <HStack gap="sm" align="center">
            {hasUserTurn && (
              <Button
                variant="outline"
                size="sm"
                disabled={finish.isPending || send.isPending}
                onClick={() => {
                  finish.mutate();
                }}
              >
                {finish.isPending ? typo("Подводим итог…") : typo("Завершить")}
              </Button>
            )}
            <Button variant="ghost" size="icon" aria-label={typo("Выйти")} onClick={onExit}>
              <X className="size-5" />
            </Button>
          </HStack>
        </HStack>

        <div className="flex justify-center">
          <StudentAvatar state={avatarState} voiceAnalyserRef={playback.voiceAnalyserRef} />
        </div>

        <SimpleCard size="lg">
          <VStack gap="sm">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <UserBubble key={turn.id} content={turn.content} />
              ) : (
                <StudentBubble key={turn.id} content={turn.content} />
              ),
            )}
            {send.isPending && send.variables !== undefined && <UserBubble content={send.variables} />}
            {(send.isPending || recorder.transcribing) && (
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-base" aria-hidden>
                  🧑‍🎓
                </span>
                <Text variant="mini" color="supplementary">
                  {recorder.transcribing ? typo("Распознаём запись…") : typo("Ученик думает…")}
                </Text>
              </div>
            )}

            {isPaywallError(send.error, "CHAT") ? (
              <PaywallCard reason="CHAT" compact />
            ) : (
              <VStack gap="sm">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendTyped();
                  }}
                >
                  <HStack gap="sm" align="end">
                    <Textarea
                      value={text}
                      className="min-h-16"
                      placeholder={typo("Объясняйте здесь — простыми словами, с примерами…")}
                      onChange={(event) => {
                        setText(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendTyped();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={send.isPending || !text.trim()}
                      aria-label={typo("Отправить")}
                    >
                      <Send className="size-4" />
                    </Button>
                  </HStack>
                </form>
                {session.voice && (
                  <VStack gap="2xs" className="items-center">
                    <MicButton
                      recording={recorder.recording}
                      disabled={send.isPending || recorder.transcribing}
                      micAnalyserRef={recorder.micAnalyserRef}
                      onPressStart={() => {
                        playback.stopPlayback();
                        void recorder.startRecording();
                      }}
                      onPressEnd={recorder.stopRecording}
                      onPressCancel={recorder.abortRecording}
                      onUnmount={recorder.abortRecording}
                    />
                    <Text variant="mini" color="supplementary">
                      {recorder.recording
                        ? typo("Говорите… отпустите, чтобы отправить")
                        : typo("Зажмите и объясняйте голосом")}
                    </Text>
                  </VStack>
                )}
              </VStack>
            )}
          </VStack>
        </SimpleCard>
      </VStack>
    </div>
  );
}

// Итог сессии: что объяснено хорошо, где пробелы, что повторить + CTA к слабым темам.
function SummaryScreen({ examId, summaryMd, onRestart }: { examId: string; summaryMd: string; onRestart: () => void }) {
  const navigate = useNavigate();
  return (
    <VStack gap="md">
      <Heading variant="h2">{typo("Итог: как прошло объяснение")}</Heading>
      <SimpleCard size="lg">
        <MarkdownView>{summaryMd}</MarkdownView>
      </SimpleCard>
      <HStack gap="sm" wrap>
        <Button
          size="pill"
          variant="brand"
          onClick={() => {
            void navigate({ to: "/app/exams/$examId", params: { examId } });
          }}
        >
          {typo("Повторить слабое")}
        </Button>
        <Button variant="outline" onClick={onRestart}>
          {typo("Объяснить ещё одну тему")}
        </Button>
      </HStack>
    </VStack>
  );
}

function TeachPage() {
  const { examId } = Route.useParams();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [greeting, setGreeting] = useState<TeachTurnItem | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const reset = () => {
    setSession(null);
    setGreeting(null);
    setSummary(null);
  };

  const renderPhase = () => {
    if (summary) return <SummaryScreen examId={examId} summaryMd={summary} onRestart={reset} />;
    if (session) {
      return (
        <DialogScreen
          session={session}
          initialTurns={greeting ? [greeting] : []}
          onSummary={setSummary}
          onExit={reset}
        />
      );
    }
    return (
      <SetupScreen
        examId={examId}
        onStarted={(started, greetingTurn) => {
          setSession(started);
          setGreeting(greetingTurn);
        }}
      />
    );
  };

  return <div className="mx-auto w-full max-w-2xl">{renderPhase()}</div>;
}
