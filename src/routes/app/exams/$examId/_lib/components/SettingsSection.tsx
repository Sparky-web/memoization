import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, ConfirmDialog, HStack, Input, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { isPaywallError, typo } from "~/lib";

import { archiveExam, Chip, deleteExam, type ExamDetail, generateExam, logEvent, setExamPublic, updateExam } from "../../../_lib";

// Настройки экзамена: параметры подготовки, публичная ссылка, перегенерация, архив и удаление.

type ExamFormat = "oral" | "test" | "written" | null;

const FORMAT_OPTIONS: readonly { value: ExamFormat; label: string }[] = [
  { value: "oral", label: typo("устно") },
  { value: "test", label: typo("тест") },
  { value: "written", label: typo("письменно") },
  { value: null, label: typo("не знаю") },
];

const MINUTES_OPTIONS: readonly number[] = [15, 25, 40, 60];

const GRADE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: typo(`сдать`), label: typo("просто сдать") },
  { value: "4", label: typo("на четыре") },
  { value: "5", label: typo("на пять") },
];

function toExamFormat(format: string | null): ExamFormat {
  if (format === "oral" || format === "test" || format === "written") return format;
  return null;
}

function toDateInputValue(examDate: ExamDetail["examDate"]): string {
  return examDate ? new Date(examDate).toISOString().slice(0, 10) : "";
}

export function SettingsSection({ exam }: { exam: ExamDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(() => toDateInputValue(exam.examDate));
  const [noDate, setNoDate] = useState(() => !exam.examDate);
  const [format, setFormat] = useState<ExamFormat>(() => toExamFormat(exam.examFormat));
  const [minutes, setMinutes] = useState(exam.dailyMinutes);
  const [targetGrade, setTargetGrade] = useState(exam.targetGrade);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [showGenerationPaywall, setShowGenerationPaywall] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
  };

  const save = useMutation({
    mutationFn: () =>
      updateExam({
        data: {
          id: exam.id,
          data: {
            examDate: noDate ? null : date || null,
            examFormat: format,
            dailyMinutes: minutes,
            targetGrade,
          },
        },
      }),
    onSuccess: () => {
      toast.success(typo("Настройки сохранены"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить настройки"));
    },
  });

  const togglePublic = useMutation({
    mutationFn: () => setExamPublic({ data: { id: exam.id, isPublic: !exam.isPublic } }),
    onSuccess: (result) => {
      toast.success(result.isPublic ? typo("Экзамен доступен по ссылке") : typo("Доступ по ссылке закрыт"));
      invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось изменить доступ"));
    },
  });

  const regenerate = useMutation({
    mutationFn: () => generateExam({ data: { examId: exam.id } }),
    onSuccess: () => {
      setConfirmRegenerate(false);
      invalidate();
    },
    onError: (error) => {
      setConfirmRegenerate(false);
      if (isPaywallError(error, "GENERATION")) {
        setShowGenerationPaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось запустить генерацию");
      toast.error(humanMessage);
    },
  });

  const toggleArchive = useMutation({
    mutationFn: () => archiveExam({ data: { id: exam.id, archived: !exam.archivedAt } }),
    onSuccess: invalidate,
    onError: (error) => {
      if (isPaywallError(error, "MULTI_EXAM")) {
        toast.info(typo("Бесплатно доступен один активный экзамен — сначала заархивируйте текущий"));
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось изменить архив"));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteExam({ data: { id: exam.id } }),
    onSuccess: () => {
      invalidate();
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить экзамен"));
    },
  });

  const publicUrl = typeof window === "undefined" ? `/d/${exam.id}` : `${window.location.origin}/d/${exam.id}`;
  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(typo("Ссылка скопирована"));
    } catch {
      toast.error(typo("Не удалось скопировать — выделите ссылку вручную"));
    }
  };

  const minutesOptions = MINUTES_OPTIONS.includes(exam.dailyMinutes)
    ? MINUTES_OPTIONS
    : [...MINUTES_OPTIONS, exam.dailyMinutes].sort((left, right) => left - right);

  return (
    <VStack gap="md">
      <SimpleCard title={typo("Подготовка")}>
        <VStack gap="xs">
          <Text variant="small" color="supplementary">
            {typo("Дата экзамена")}
          </Text>
          <HStack gap="sm" align="center" wrap>
            <Input
              value={date}
              type="date"
              className="w-44"
              disabled={noDate}
              aria-label={typo("Дата экзамена")}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={noDate}
                className="accent-primary"
                onChange={(event) => {
                  setNoDate(event.target.checked);
                }}
              />
              <Text variant="small" color="supplementary">
                {typo("без даты — поддерживающее повторение")}
              </Text>
            </label>
          </HStack>
        </VStack>
        <VStack gap="xs">
          <Text variant="small" color="supplementary">
            {typo("Формат экзамена")}
          </Text>
          <HStack gap="2xs" wrap>
            {FORMAT_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                active={format === option.value}
                onClick={() => {
                  setFormat(option.value);
                }}
              >
                {option.label}
              </Chip>
            ))}
          </HStack>
        </VStack>
        <VStack gap="xs">
          <Text variant="small" color="supplementary">
            {typo("Минут в день на этот экзамен")}
          </Text>
          <HStack gap="2xs" wrap>
            {minutesOptions.map((option) => (
              <Chip
                key={option}
                active={minutes === option}
                onClick={() => {
                  setMinutes(option);
                }}
              >
                {typo(`${option} минут`)}
              </Chip>
            ))}
          </HStack>
        </VStack>
        <VStack gap="xs">
          <Text variant="small" color="supplementary">
            {typo("Целевая оценка")}
          </Text>
          <HStack gap="2xs" wrap>
            {GRADE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={targetGrade === option.value}
                onClick={() => {
                  setTargetGrade(targetGrade === option.value ? null : option.value);
                }}
              >
                {option.label}
              </Chip>
            ))}
          </HStack>
        </VStack>
        <HStack>
          <Button
            disabled={save.isPending || (!noDate && !date && Boolean(exam.examDate))}
            onClick={() => {
              save.mutate();
            }}
          >
            {typo("Сохранить")}
          </Button>
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Публичная ссылка")}>
        <Text variant="small" color="supplementary">
          {typo("По ссылке виден список вопросов без ответов; любой может забрать экзамен себе и готовиться со своим прогрессом.")}
        </Text>
        <HStack gap="sm" align="center" wrap>
          <Button
            variant="outline"
            size="sm"
            disabled={togglePublic.isPending}
            onClick={() => {
              togglePublic.mutate();
            }}
          >
            {exam.isPublic ? typo("Закрыть доступ") : typo("Открыть доступ")}
          </Button>
          {exam.isPublic && (
            <HStack gap="2xs" align="center">
              <Text variant="small" color="supplementary" breakWords>
                {publicUrl}
              </Text>
              <Button variant="ghost" size="icon" aria-label={typo("Скопировать ссылку")} onClick={() => void copyPublicLink()}>
                <Copy className="size-4" />
              </Button>
            </HStack>
          )}
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Перегенерация")}>
        <Text variant="small" color="supplementary">
          {typo("ИИ заново ответит на все вопросы и соберёт карточки — например, после загрузки материалов или правки списка.")}
        </Text>
        <HStack>
          <Button
            variant="outline"
            size="sm"
            disabled={exam.status === "processing" || regenerate.isPending || !exam.questions.length}
            onClick={() => {
              setConfirmRegenerate(true);
            }}
          >
            {typo("Перегенерировать экзамен")}
          </Button>
        </HStack>
        {showGenerationPaywall && (
          <PaywallCard
            reason="GENERATION"
            compact
            onShown={() => {
              void logEvent({ data: { name: "paywall_shown", meta: { reason: "GENERATION", place: "exam_settings" } } }).catch(
                () => undefined,
              );
            }}
          />
        )}
      </SimpleCard>

      <SimpleCard title={typo("Архив и удаление")}>
        <HStack gap="sm" wrap>
          <Button
            variant="outline"
            size="sm"
            disabled={toggleArchive.isPending}
            onClick={() => {
              toggleArchive.mutate();
            }}
          >
            {exam.archivedAt ? typo("Вернуть из архива") : typo("В архив")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {typo("Удалить экзамен")}
          </Button>
        </HStack>
      </SimpleCard>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={typo("Перегенерировать экзамен?")}
        description={typo("ИИ-карточки и прогресс по ним будут заменены, карточки, добавленные вручную, останутся.")}
        confirmLabel={typo("Перегенерировать")}
        confirmPending={regenerate.isPending}
        onConfirm={() => {
          regenerate.mutate();
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={typo("Удалить экзамен?")}
        description={typo("Вопросы, карточки и весь прогресс по ним будут удалены безвозвратно.")}
        confirmLabel={typo("Удалить")}
        confirmPending={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </VStack>
  );
}
