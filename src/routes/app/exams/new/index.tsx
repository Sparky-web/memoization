import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  Button,
  Heading,
  HStack,
  Input,
  Link,
  PaywallCard,
  ProgressBar,
  SimpleCard,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { FREE_QUESTIONS_PER_EXAM, isPaywallError, PRO_EXAMS, PRO_QUESTIONS_PER_EXAM, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";
import { createExamsDraft, deleteExam, generateExam, updateExam } from "~/server/fn/exams";
import { setExamQuestions } from "~/server/fn/questions";
import { updateUserSettings } from "~/server/fn/settings";

import {
  Chip,
  examQueries,
  formatFileSize,
  MaterialDropzone,
  parseQuestionList,
  questionsCountLabel,
  uploadExamMaterials,
} from "../_lib";

// Мастер создания: несколько экзаменов за один проход — черновики в клиентском стейте,
// создание, вопросы, материалы и генерация запускаются одной кнопкой на последнем шаге.

export const Route = createFileRoute("/app/exams/new/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(examQueries.billing()),
      context.queryClient.ensureQueryData(examQueries.settings()),
      context.queryClient.ensureQueryData(examQueries.list()),
    ]),
  head: () => ({ meta: [{ title: typo("Новый экзамен") }] }),
  component: NewExamWizardPage,
});

type WizardStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<WizardStep, string> = {
  1: typo("Экзамены"),
  2: typo("Вопросы"),
  3: typo("Материалы"),
  4: typo("Параметры"),
};

const WIZARD_STEPS: readonly WizardStep[] = [1, 2, 3, 4];

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

const MAX_WIZARD_FILES = 5;

interface DraftExam {
  key: number;
  title: string;
  date: string;
  noDate: boolean;
  format: ExamFormat;
  questionsText: string;
  files: File[];
}

function emptyDraft(key: number): DraftExam {
  return { key, title: "", date: "", noDate: false, format: null, questionsText: "", files: [] };
}

function WizardProgress({ step }: { step: WizardStep }) {
  return (
    <VStack gap="xs">
      <HStack gap="sm" align="center" wrap>
        {WIZARD_STEPS.map((item) => {
          const stateClass = item === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
          return (
            <HStack key={item} gap="2xs" align="center">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${stateClass}`}
              >
                {item}
              </span>
              <Text variant="mini" color={item === step ? "main" : "supplementary"}>
                {STEP_TITLES[item]}
              </Text>
            </HStack>
          );
        })}
      </HStack>
      <ProgressBar value={step / WIZARD_STEPS.length} />
    </VStack>
  );
}

// Шаг 1: карточки-строки экзаменов — название, дата (или «без даты»), формат.
function ExamDraftRow({
  draft,
  removable,
  onChange,
  onRemove,
}: {
  draft: DraftExam;
  removable: boolean;
  onChange: (patch: Partial<DraftExam>) => void;
  onRemove: () => void;
}) {
  return (
    <SimpleCard>
      <HStack gap="sm" align="center">
        <Input
          value={draft.title}
          placeholder={typo("Название экзамена, например «История России»")}
          maxLength={200}
          onChange={(event) => {
            onChange({ title: event.target.value });
          }}
        />
        {removable && (
          <Button variant="ghost" size="icon" aria-label={typo("Убрать экзамен")} onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </HStack>
      <HStack gap="sm" align="center" wrap>
        <Input
          value={draft.date}
          type="date"
          className="w-44"
          disabled={draft.noDate}
          aria-label={typo("Дата экзамена")}
          onChange={(event) => {
            onChange({ date: event.target.value });
          }}
        />
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.noDate}
            className="accent-primary"
            onChange={(event) => {
              onChange({ noDate: event.target.checked });
            }}
          />
          <Text variant="small" color="supplementary">
            {typo("пока без даты")}
          </Text>
        </label>
      </HStack>
      <HStack gap="2xs" wrap>
        {FORMAT_OPTIONS.map((option) => (
          <Chip
            key={option.label}
            active={draft.format === option.value}
            onClick={() => {
              onChange({ format: option.value });
            }}
          >
            {option.label}
          </Chip>
        ))}
      </HStack>
    </SimpleCard>
  );
}

// Шаг 2: textarea со списком вопросов, живой парсинг и лимиты тарифа.
function QuestionsStep({
  draft,
  questionLimit,
  pro,
  onChange,
}: {
  draft: DraftExam;
  questionLimit: number;
  pro: boolean;
  onChange: (patch: Partial<DraftExam>) => void;
}) {
  const parsed = parseQuestionList(draft.questionsText);
  const overLimit = parsed.length > questionLimit;

  return (
    <VStack gap="md">
      <Textarea
        value={draft.questionsText}
        rows={10}
        placeholder={typo(
          "Вставьте список вопросов — по одному в строке:\n1. Причины Смутного времени\n2. Реформы Петра I\n…",
        )}
        onChange={(event) => {
          onChange({ questionsText: event.target.value });
        }}
      />
      <VStack gap="2xs">
        <HStack justify="between" align="center" gap="sm" wrap>
          <Text variant="small" color={overLimit ? "destructive" : "supplementary"}>
            {typo(`Распознано: ${questionsCountLabel(parsed.length)}`)}
          </Text>
          <Text variant="mini" color="supplementary">
            {typo(`лимит — ${questionLimit}`)}
          </Text>
        </HStack>
        <ProgressBar value={parsed.length / questionLimit} tone={overLimit ? "warning" : "primary"} />
      </VStack>
      {overLimit && !pro && (
        <PaywallCard
          reason="MULTI_EXAM"
          compact
          onShown={() => {
            void logEvent({
              data: { name: "paywall_shown", meta: { reason: "MULTI_EXAM", place: "wizard_questions" } },
            }).catch(() => undefined);
          }}
        />
      )}
      {overLimit && pro && (
        <Text variant="small" color="destructive">
          {typo(
            `В Pro на один экзамен помещается до ${PRO_QUESTIONS_PER_EXAM} вопросов — разделите список на два экзамена.`,
          )}
        </Text>
      )}
      {parsed.length > 0 && (
        <VStack gap="2xs" className="max-h-64 overflow-y-auto rounded-2xl bg-card p-4">
          {parsed.map((question, index) => (
            <HStack key={`${index}-${question.slice(0, 24)}`} gap="xs">
              <Text variant="small" color="supplementary">
                {index + 1}.
              </Text>
              <Text variant="small" breakWords>
                {typo(question)}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

// Шаг 3: материалы к экзамену — файлы копятся в стейте и загружаются после создания экзаменов.
function MaterialsStep({
  draft,
  pro,
  onChange,
}: {
  draft: DraftExam;
  pro: boolean;
  onChange: (patch: Partial<DraftExam>) => void;
}) {
  if (!pro) {
    return (
      <VStack gap="md">
        <Text variant="small" color="supplementary">
          {typo("Ответы будут строиться по твоим конспектам со ссылками на источник — это возможность Pro.")}
        </Text>
        <PaywallCard
          reason="MATERIALS"
          compact
          onShown={() => {
            void logEvent({
              data: { name: "paywall_shown", meta: { reason: "MATERIALS", place: "wizard_materials" } },
            }).catch(() => undefined);
          }}
        />
      </VStack>
    );
  }

  const addFiles = (incoming: File[]) => {
    const merged = [...draft.files];
    for (const file of incoming) {
      if (merged.some((existing) => existing.name === file.name && existing.size === file.size)) continue;
      merged.push(file);
    }
    if (merged.length > MAX_WIZARD_FILES) {
      toast.error(typo(`Не больше ${MAX_WIZARD_FILES} файлов на экзамен`));
    }
    onChange({ files: merged.slice(0, MAX_WIZARD_FILES) });
  };

  return (
    <VStack gap="md">
      <Text variant="small" color="supplementary">
        {typo("Конспекты, методички, учебники: ответы будут построены по ним, у карточек появятся ссылки на источник.")}
      </Text>
      <MaterialDropzone onFiles={addFiles} />
      {draft.files.length > 0 && (
        <VStack gap="2xs">
          {draft.files.map((file) => (
            <HStack key={`${file.name}-${file.size}`} justify="between" align="center" gap="sm">
              <Text variant="small" breakWords>
                {file.name}
              </Text>
              <HStack gap="sm" align="center">
                <Text variant="mini" color="supplementary">
                  {formatFileSize(file.size)}
                </Text>
                <Button
                  variant="link"
                  size="inline"
                  onClick={() => {
                    onChange({ files: draft.files.filter((existing) => existing !== file) });
                  }}
                >
                  {typo("Убрать")}
                </Button>
              </HStack>
            </HStack>
          ))}
          <Text variant="mini" color="supplementary">
            {typo("Файлы загрузятся при создании экзамена.")}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}

function draftHasValidDate(draft: DraftExam): boolean {
  return draft.noDate || Boolean(draft.date);
}

function NewExamWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: billing } = useSuspenseQuery(examQueries.billing());
  const { data: settings } = useSuspenseQuery(examQueries.settings());
  const { data: existingExams } = useSuspenseQuery(examQueries.list());

  const pro = billing.pro;
  const questionLimit = pro ? PRO_QUESTIONS_PER_EXAM : FREE_QUESTIONS_PER_EXAM;

  const draftKeyRef = useRef(1);
  const [step, setStep] = useState<WizardStep>(1);
  const [drafts, setDrafts] = useState<DraftExam[]>([emptyDraft(0)]);
  const [activeTab, setActiveTab] = useState(0);
  const [minutes, setMinutes] = useState(() =>
    MINUTES_OPTIONS.includes(settings.dailyMinutesTotal) ? settings.dailyMinutesTotal : 25,
  );
  const [targetGrade, setTargetGrade] = useState<string | null>(null);
  const [showMultiExamPaywall, setShowMultiExamPaywall] = useState(false);
  const [showGenerationPaywall, setShowGenerationPaywall] = useState(false);
  // Ретрай сабмита не создаёт дубликаты: соответствие «черновик → созданный экзамен» держим
  // по draft.key (не по индексу!) — после «Назад», удаления и добавления черновиков вопросы,
  // формат и файлы не уедут в чужой экзамен, а новые черновики честно создадутся.
  const createdRef = useRef(new Map<number, { id: string; title: string }>());
  // Экзамены, чья генерация уже запустилась: на ретрае их пропускаем целиком —
  // setExamQuestions и generateExam ответили бы 409 «генерация уже идёт» и оборвали бы ретрай.
  const generatedRef = useRef(new Set<number>());
  // Зеркало id из createdRef для рендера (ref во время рендера читать нельзя): экзамены,
  // созданные этим мастером при неудачном сабмите, соответствуют текущим черновикам (1:1 по key) —
  // не считаем их «занятыми», иначе ретрай упирался бы в ложный «лимит активных экзаменов»
  // из-за двойного счёта черновика и его экзамена-двойника.
  const [wizardExamIds, setWizardExamIds] = useState<ReadonlySet<string>>(new Set());

  const activeExamCount = existingExams.filter((exam) => !exam.archivedAt && !wizardExamIds.has(exam.id)).length;

  const activeDraft = drafts[Math.min(activeTab, drafts.length - 1)] ?? drafts[0];

  const patchDraft = (key: number, patch: Partial<DraftExam>) => {
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
  };

  const addDraft = () => {
    if (!pro && drafts.length + activeExamCount >= 1) {
      setShowMultiExamPaywall(true);
      return;
    }
    if (drafts.length + activeExamCount >= PRO_EXAMS) {
      toast.info(typo(`В Pro можно вести до ${PRO_EXAMS} активных экзаменов`));
      return;
    }
    draftKeyRef.current += 1;
    setDrafts((current) => [...current, emptyDraft(draftKeyRef.current)]);
  };

  const parsedByDraft = drafts.map((draft) => parseQuestionList(draft.questionsText));
  const totalQuestions = parsedByDraft.reduce((sum, questions) => sum + questions.length, 0);
  const overCapacity = pro ? drafts.length + activeExamCount > PRO_EXAMS : drafts.length + activeExamCount > 1;

  const stepReady = (): boolean => {
    if (step === 1)
      return drafts.every((draft) => draft.title.trim().length > 0 && draftHasValidDate(draft)) && !overCapacity;
    if (step === 2)
      return parsedByDraft.every((questions) => questions.length >= 1 && questions.length <= questionLimit);
    return true;
  };

  const create = useMutation({
    mutationFn: async () => {
      await updateUserSettings({ data: { dailyMinutesTotal: minutes } });
      const createdByKey = createdRef.current;
      const pendingDrafts = drafts.filter((draft) => !createdByKey.has(draft.key));
      if (pendingDrafts.length) {
        const created = await createExamsDraft({
          data: {
            exams: pendingDrafts.map((draft) => ({
              title: draft.title.trim(),
              examDate: draft.noDate ? null : draft.date || null,
            })),
          },
        });
        created.forEach((exam, index) => {
          const draft = pendingDrafts[index];
          if (draft) createdByKey.set(draft.key, exam);
        });
        setWizardExamIds(new Set([...createdByKey.values()].map((exam) => exam.id)));
      }
      let generationPaywall = false;
      for (const [index, draft] of drafts.entries()) {
        const exam = createdByKey.get(draft.key);
        if (!exam || generatedRef.current.has(draft.key)) continue;
        await setExamQuestions({ data: { examId: exam.id, questions: parsedByDraft[index] ?? [] } });
        await updateExam({
          data: { id: exam.id, data: { examFormat: draft.format, targetGrade, dailyMinutes: minutes } },
        });
        if (pro && draft.files.length) {
          try {
            await uploadExamMaterials(exam.id, draft.files);
          } catch (error) {
            console.error(error);
            toast.error(
              typo(`Не удалось загрузить материалы «${draft.title.trim()}» — добавьте их на странице экзамена`),
            );
          }
        }
        try {
          await generateExam({ data: { examId: exam.id } });
          generatedRef.current.add(draft.key);
        } catch (error) {
          if (isPaywallError(error, "GENERATION")) {
            generationPaywall = true;
            continue;
          }
          throw error;
        }
      }
      return { generationPaywall };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      void queryClient.invalidateQueries({ queryKey: ["plan"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (result.generationPaywall) {
        setShowGenerationPaywall(true);
        return;
      }
      toast.success(typo("Экзамены создаются: ответы и карточки появятся через несколько минут"));
      void navigate({ to: "/app" });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      if (isPaywallError(error, "MULTI_EXAM")) {
        setStep(1);
        setShowMultiExamPaywall(true);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось создать экзамены");
      toast.error(humanMessage);
    },
  });

  const renderTabs = () => (
    <HStack gap="2xs" wrap>
      {drafts.map((draft, index) => (
        <Chip
          key={draft.key}
          active={index === Math.min(activeTab, drafts.length - 1)}
          onClick={() => {
            setActiveTab(index);
          }}
        >
          {typo(draft.title.trim() || `Экзамен ${index + 1}`)}
        </Chip>
      ))}
    </HStack>
  );

  const renderStep = () => {
    if (step === 1) {
      return (
        <VStack gap="md">
          {drafts.map((draft) => (
            <ExamDraftRow
              key={draft.key}
              draft={draft}
              removable={drafts.length > 1}
              onChange={(patch) => {
                patchDraft(draft.key, patch);
              }}
              onRemove={() => {
                // Черновик мог уже материализоваться в экзамен при неудачном сабмите —
                // подчищаем и запись соответствия, и сам экзамен-призрак (он ест лимит).
                const created = createdRef.current.get(draft.key);
                if (created) {
                  createdRef.current.delete(draft.key);
                  generatedRef.current.delete(draft.key);
                  setWizardExamIds(new Set([...createdRef.current.values()].map((exam) => exam.id)));
                  void deleteExam({ data: { id: created.id } })
                    .then(() => queryClient.invalidateQueries({ queryKey: ["exams"] }))
                    .catch(() => undefined);
                }
                setDrafts((current) => current.filter((existing) => existing.key !== draft.key));
              }}
            />
          ))}
          <HStack gap="sm" align="center" wrap>
            <Button variant="outline" onClick={addDraft}>
              <Plus className="size-4" />
              {typo("Ещё экзамен")}
            </Button>
            <Text variant="small" color="supplementary">
              {typo("Готовишься к нескольким? Добавь все сразу — план распределит время сам.")}
            </Text>
          </HStack>
          {showMultiExamPaywall && (
            <PaywallCard
              reason="MULTI_EXAM"
              compact
              onShown={() => {
                void logEvent({
                  data: { name: "paywall_shown", meta: { reason: "MULTI_EXAM", place: "wizard_exams" } },
                }).catch(() => undefined);
              }}
            />
          )}
          {overCapacity && !showMultiExamPaywall && (
            <Text variant="small" color="destructive">
              {typo(
                "Лимит активных экзаменов уже занят — заархивируйте прошедший экзамен или уберите лишний черновик.",
              )}{" "}
              <Link to="/app/exams" variant="underline">
                {typo("Посмотреть активные экзамены")}
              </Link>
            </Text>
          )}
        </VStack>
      );
    }
    if (step === 2) {
      return (
        <VStack gap="md">
          {drafts.length > 1 && renderTabs()}
          {activeDraft && (
            <QuestionsStep
              draft={activeDraft}
              questionLimit={questionLimit}
              pro={pro}
              onChange={(patch) => {
                patchDraft(activeDraft.key, patch);
              }}
            />
          )}
        </VStack>
      );
    }
    if (step === 3) {
      return (
        <VStack gap="md">
          {drafts.length > 1 && pro && renderTabs()}
          {activeDraft && (
            <MaterialsStep
              draft={activeDraft}
              pro={pro}
              onChange={(patch) => {
                patchDraft(activeDraft.key, patch);
              }}
            />
          )}
        </VStack>
      );
    }
    return (
      <VStack gap="lg">
        <VStack gap="xs">
          <Text bold>{typo("Сколько минут в день готов заниматься?")}</Text>
          <HStack gap="2xs" wrap>
            {MINUTES_OPTIONS.map((option) => (
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
          <Text variant="mini" color="supplementary">
            {typo("Бюджет общий на все экзамены — план сам поделит его по срочности.")}
          </Text>
        </VStack>
        <VStack gap="xs">
          <Text bold>{typo("Целевая оценка")}</Text>
          <HStack gap="2xs" wrap>
            {GRADE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={targetGrade === option.value}
                onClick={() => {
                  setTargetGrade((current) => (current === option.value ? null : option.value));
                }}
              >
                {option.label}
              </Chip>
            ))}
          </HStack>
        </VStack>
        <SimpleCard>
          <Text variant="small" color="supplementary">
            {typo(
              `Итого: ${drafts.length} ${pluralExams(drafts.length)} · ${questionsCountLabel(totalQuestions)}. ИИ ответит на каждый вопрос и соберёт атомарные карточки — это займёт несколько минут.`,
            )}
          </Text>
        </SimpleCard>
        {showGenerationPaywall && (
          <VStack gap="sm">
            <PaywallCard
              reason="GENERATION"
              compact
              onShown={() => {
                void logEvent({
                  data: { name: "paywall_shown", meta: { reason: "GENERATION", place: "wizard_create" } },
                }).catch(() => undefined);
              }}
            />
            <Text variant="small" color="supplementary">
              {typo("Экзамены созданы как черновики — генерацию можно запустить со страницы экзамена после оплаты.")}
            </Text>
            <HStack>
              <Button
                variant="outline"
                onClick={() => {
                  void navigate({ to: "/app" });
                }}
              >
                {typo("К плану")}
              </Button>
            </HStack>
          </VStack>
        )}
      </VStack>
    );
  };

  return (
    <VStack gap="xl">
      <VStack gap="sm">
        <Heading variant="h1">{typo("Новый экзамен")}</Heading>
        <WizardProgress step={step} />
        <Heading variant="h3" asParagraph>
          {STEP_TITLES[step]}
        </Heading>
      </VStack>

      {renderStep()}

      <HStack gap="sm" wrap>
        {step > 1 && (
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={() => {
              setStep(previousStep(step));
            }}
          >
            {typo("Назад")}
          </Button>
        )}
        {step < 4 ? (
          <Button
            disabled={!stepReady()}
            onClick={() => {
              setActiveTab(0);
              setStep(nextStep(step));
            }}
          >
            {typo("Дальше")}
          </Button>
        ) : (
          <Button
            size="pill"
            disabled={create.isPending || showGenerationPaywall}
            onClick={() => {
              create.mutate();
            }}
          >
            {create.isPending ? typo("Создаём…") : typo("Создать и сгенерировать")}
          </Button>
        )}
      </HStack>
    </VStack>
  );
}

function pluralExams(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return typo("экзаменов");
  if (mod10 === 1) return typo("экзамен");
  if (mod10 >= 2 && mod10 <= 4) return typo("экзамена");
  return typo("экзаменов");
}

function nextStep(step: WizardStep): WizardStep {
  if (step === 1) return 2;
  if (step === 2) return 3;
  return 4;
}

function previousStep(step: WizardStep): WizardStep {
  if (step === 4) return 3;
  if (step === 3) return 2;
  return 1;
}
