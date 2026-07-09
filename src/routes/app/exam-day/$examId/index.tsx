import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Droplets, Moon, Sunrise, Trash2, Wind } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Heading, HStack, SimpleCard, Text, Textarea, useMountEffect, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";

import { examQueries } from "../../exams/_lib";
import { type AnxietyDumpItem, createAnxietyDump, deleteAnxietyDump, wellbeingQueries } from "../_lib";

// «День экзамена» — спокойный чек-лист на сегодня/завтра: короткое повторение,
// выгрузка тревог (экспрессивное письмо) и пара советов перед аудиторией.
// Стилистика поддерживающая: никакого давления и марафонов в последний момент.

export const Route = createFileRoute("/app/exam-day/$examId/")({
  loader: async ({ context, params }) => {
    const [exam] = await Promise.all([
      context.queryClient.ensureQueryData(examQueries.detail(params.examId)),
      context.queryClient.ensureQueryData(examQueries.billing()),
      context.queryClient.ensureQueryData(wellbeingQueries.dumps(params.examId)),
    ]);
    // Гейт по дате (daysToExam считает сервер): чек-лист существует только накануне и в день
    // экзамена — раньше прямая ссылка уводит на «Сегодня», как и архив или экзамен без даты.
    if (exam.archivedAt || exam.daysToExam === null || exam.daysToExam > 1) {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({ meta: [{ title: typo("День экзамена") }] }),
  component: ExamDayPage,
});

const DUMP_MINUTES = 10;

// Обратный отсчёт выгрузки тревог: дедлайн фиксируется при монтировании, тикаем раз в секунду.
function CountdownTimer() {
  const [endsAt] = useState(() => Date.now() + DUMP_MINUTES * 60 * 1000);
  const [secondsLeft, setSecondsLeft] = useState(DUMP_MINUTES * 60);

  useMountEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(Math.round((endsAt - Date.now()) / 1000), 0));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  });

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return (
    <HStack gap="sm" align="center">
      <Text variant="large" bold>
        {`${minutes}:${String(seconds).padStart(2, "0")}`}
      </Text>
      {!secondsLeft && (
        <Text variant="small" color="supplementary">
          {typo("Время вышло — спокойно закончи мысль.")}
        </Text>
      )}
    </HStack>
  );
}

function AnxietyDumpRow({ dump }: { dump: AnxietyDumpItem }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteAnxietyDump({ data: { id: dump.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["anxiety"] });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить запись"));
    },
  });

  return (
    <HStack justify="between" align="center" gap="sm" wrap>
      <VStack gap="3xs">
        <Text variant="small" color="supplementary">
          {formatDateRuMsk(new Date(dump.createdAt))}
        </Text>
        <Text variant="small" breakWords>
          {typo(dump.preview)}
        </Text>
      </VStack>
      <Button
        variant="ghost"
        size="icon"
        aria-label={typo("Удалить запись")}
        disabled={remove.isPending}
        onClick={() => {
          remove.mutate();
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </HStack>
  );
}

function AnxietyDumpCard({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const { data: dumps } = useSuspenseQuery(wellbeingQueries.dumps(examId));
  const [writing, setWriting] = useState(false);
  const [content, setContent] = useState("");
  const [discardAfter, setDiscardAfter] = useState(false);

  const finishWriting = () => {
    setWriting(false);
    setContent("");
    setDiscardAfter(false);
  };

  const save = useMutation({
    mutationFn: () => createAnxietyDump({ data: { examId, content: content.trim() } }),
    onSuccess: () => {
      toast.success(typo("Записано. Тревога на бумаге занимает меньше места, чем в голове"));
      void queryClient.invalidateQueries({ queryKey: ["anxiety"] });
      finishWriting();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить — текст остался на экране, попробуй ещё раз"));
    },
  });

  return (
    <SimpleCard title={typo("Выгрузка тревог — 10 минут письма")}>
      <Text variant="small" color="supplementary">
        {typo(
          "Выпиши всё, что тревожит перед экзаменом, — как есть, без цензуры. 10 минут такого письма освобождают рабочую память от беспокойства.",
        )}
      </Text>
      {writing ? (
        <VStack gap="md">
          <CountdownTimer />
          <Textarea
            value={content}
            rows={8}
            placeholder={typo("Что тревожит? Пиши свободно — этот текст видишь только ты.")}
            onChange={(event) => {
              setContent(event.target.value);
            }}
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={discardAfter}
              className="accent-primary"
              onChange={(event) => {
                setDiscardAfter(event.target.checked);
              }}
            />
            <Text variant="small" color="supplementary">
              {typo("Стереть сразу после — запись никуда не сохранится, важно само письмо")}
            </Text>
          </label>
          <HStack gap="sm" wrap>
            {discardAfter ? (
              <Button
                onClick={() => {
                  toast.success(typo("Стёрто. Стало легче — это и было целью"));
                  finishWriting();
                }}
              >
                {typo("Завершить и стереть")}
              </Button>
            ) : (
              <Button
                disabled={!content.trim() || save.isPending}
                onClick={() => {
                  save.mutate();
                }}
              >
                {typo("Сохранить запись")}
              </Button>
            )}
            <Button variant="ghost" onClick={finishWriting}>
              {typo("Отменить")}
            </Button>
          </HStack>
        </VStack>
      ) : (
        <HStack>
          <Button
            variant="outline"
            onClick={() => {
              setWriting(true);
            }}
          >
            {typo("Начать выгрузку тревог")}
          </Button>
        </HStack>
      )}
      <Text variant="mini" color="supplementary">
        {typo("Записи строго приватные: их видишь только ты, удалить можно в любой момент.")}
      </Text>
      {dumps.length > 0 && (
        <VStack gap="2xs">
          {dumps.map((dump) => (
            <AnxietyDumpRow key={dump.id} dump={dump} />
          ))}
        </VStack>
      )}
    </SimpleCard>
  );
}

const CALM_TIPS: readonly { icon: typeof Moon; text: string }[] = [
  {
    icon: Moon,
    text: typo("Сон важнее ночной зубрёжки: память записывается во сне, и упущенную ночь не наверстать. Ляг вовремя."),
  },
  {
    icon: Droplets,
    text: typo("Возьми с собой воду: даже лёгкая жажда заметно бьёт по концентрации."),
  },
  {
    icon: Wind,
    text: typo("Волнение перед дверью — нормально. Дыхание 4-7-8: вдох на 4 счёта, задержка на 7, выдох на 8 — три круга, и пульс уляжется."),
  },
];

function ExamDayPage() {
  const { examId } = Route.useParams();
  const navigate = useNavigate();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const { data: billing } = useSuspenseQuery(examQueries.billing());

  // Утреннее повторение — короткий спринт по слабым: Pro — cram, Free — обычная сессия.
  const morningKind = billing.pro ? "cram" : "daily";
  // formatDateRuMsk заканчивается на «г.» — разделяем тире, чтобы не было двойной точки.
  const introText = exam.examDate
    ? typo(
        `Экзамен ${formatDateRuMsk(new Date(exam.examDate))} — основная работа уже сделана. Сегодня только спокойная поддержка: короткое повторение, разгрузка головы и вода с собой.`,
      )
    : typo("Основная работа уже сделана. Сегодня только спокойная поддержка: короткое повторение, разгрузка головы и вода с собой.");

  return (
    <VStack gap="xl" className="mx-auto w-full max-w-2xl">
      <VStack gap="2xs">
        <Heading variant="h1">{typo(`День экзамена: ${exam.title}`)}</Heading>
        <Text color="supplementary">{introText}</Text>
      </VStack>

      <SimpleCard title={typo("Короткое утреннее повторение")}>
        <HStack justify="between" align="center" gap="md" wrap>
          <HStack gap="sm" align="center">
            <Sunrise className="size-5 text-warning" />
            <Text variant="small" color="supplementary">
              {typo("10–15 минут по самым слабым карточкам — освежить, а не выучить заново. Без марафона.")}
            </Text>
          </HStack>
          <Button
            onClick={() => {
              void navigate({ to: "/app/exams/$examId/session", params: { examId }, search: { kind: morningKind } });
            }}
          >
            {typo("Начать повторение")}
          </Button>
        </HStack>
      </SimpleCard>

      <AnxietyDumpCard examId={examId} />

      <SimpleCard title={typo("Перед входом в аудиторию")}>
        <VStack gap="sm">
          {CALM_TIPS.map((tip) => (
            <HStack key={tip.text} gap="sm" align="center">
              <tip.icon className="size-5 shrink-0 text-muted-foreground" />
              <Text variant="small" color="supplementary" breakWords>
                {tip.text}
              </Text>
            </HStack>
          ))}
        </VStack>
      </SimpleCard>

      <Text variant="mini" color="supplementary">
        {typo("Ты готовился по-настоящему — припоминанием, а не перечитыванием. Этого достаточно. Удачи!")}
      </Text>
    </VStack>
  );
}
