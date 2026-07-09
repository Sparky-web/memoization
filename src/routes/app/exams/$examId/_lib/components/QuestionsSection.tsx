import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Heading, HStack, MarkdownView, ResponsiveModal, SimpleCard, Text, Textarea, VStack } from "~/components";
import { typo } from "~/lib";

import {
  cardFormatLabel,
  CoverageBadge,
  type ExamDetail,
  examQueries,
  type ExamQuestionItem,
  parseQuestionList,
  questionsCountLabel,
  regenerateQuestionCards,
  setExamQuestions,
} from "../../../_lib";

// Вопросы экзамена: покрытие материалами, страница вопроса (ответ + карточки + пересборка)
// и правка списка целиком.

function QuestionRow({ question, onOpen }: { question: ExamQuestionItem; onOpen: () => void }) {
  return (
    <button type="button" className="cursor-pointer rounded-2xl bg-card p-4 text-left transition-colors hover:bg-accent/40" onClick={onOpen}>
      <VStack gap="2xs">
        <HStack gap="xs">
          <Text variant="small" color="supplementary">
            {question.position + 1}.
          </Text>
          <Text variant="small" bold breakWords>
            {typo(question.text)}
          </Text>
        </HStack>
        <HStack gap="xs" align="center" wrap>
          {question.topic && <Badge variant="outline">{typo(question.topic)}</Badge>}
          {question.hasAnswer ? (
            <CoverageBadge covered={question.covered} aiGenerated={question.aiGenerated} />
          ) : (
            <Badge variant="muted">{typo("ответ ещё не сгенерирован")}</Badge>
          )}
          {question.cardCount > 0 && (
            <Text variant="mini" color="supplementary">
              {typo(`карточек: ${question.cardCount}`)}
            </Text>
          )}
        </HStack>
      </VStack>
    </button>
  );
}

// Страница вопроса в модале: полный ответ, источник, карточки и точечная пересборка.
function QuestionModal({ questionId, onClose }: { questionId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery(examQueries.question(questionId));

  const regenerate = useMutation({
    mutationFn: () => regenerateQuestionCards({ data: { questionId } }),
    onSuccess: (result) => {
      toast.success(typo(`Пересобрали карточки: ${result.count}`));
      void queryClient.invalidateQueries({ queryKey: ["questions", "detail", questionId] });
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось пересобрать карточки");
      toast.error(humanMessage);
    },
  });

  const question = detail.data;
  return (
    <ResponsiveModal open onOpenChange={onClose} title={typo("Вопрос")}>
      {!question ? (
        <VStack gap="sm">
          <div className="h-5 w-3/4 animate-pulse rounded-full bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        </VStack>
      ) : (
        <VStack gap="md">
          <Text bold breakWords>
            {typo(question.text)}
          </Text>
          <HStack gap="xs" wrap>
            {question.topic && <Badge variant="outline">{typo(question.topic)}</Badge>}
            <CoverageBadge covered={question.covered} aiGenerated={question.aiGenerated} />
          </HStack>
          {question.sourceRef && (
            <Text variant="blockquote" color="supplementary" breakWords>
              {typo(`Из конспекта: ${question.sourceRef}`)}
            </Text>
          )}
          {question.answerMd ? (
            <MarkdownView>{question.answerMd}</MarkdownView>
          ) : (
            <Text color="supplementary">{typo("Ответ ещё не сгенерирован — запустите генерацию экзамена.")}</Text>
          )}
          <HStack justify="between" align="center" gap="sm" wrap>
            <Heading variant="h4" asParagraph>
              {typo(`Карточки вопроса · ${question.cards.length}`)}
            </Heading>
            <Button
              variant="outline"
              size="sm"
              disabled={regenerate.isPending || !question.answerMd}
              onClick={() => {
                regenerate.mutate();
              }}
            >
              {regenerate.isPending ? typo("Пересобираем…") : typo("Пересобрать карточки")}
            </Button>
          </HStack>
          <VStack gap="sm">
            {question.cards.map((card) => (
              <VStack key={card.id} gap="3xs" className="rounded-2xl bg-muted/40 p-3">
                <HStack gap="xs" wrap>
                  <Badge variant="muted">{cardFormatLabel(card.format)}</Badge>
                  {card.suspended && <Badge variant="outline">{typo("выключена")}</Badge>}
                  {card.flagged && <Badge variant="primary">{typo("проверить")}</Badge>}
                </HStack>
                <Text variant="small" bold breakWords>
                  {typo(card.prompt)}
                </Text>
                <Text variant="small" color="supplementary" breakWords>
                  {typo(card.answer)}
                </Text>
                {card.explanation && (
                  <Text variant="mini" color="supplementary" breakWords>
                    {typo(card.explanation)}
                  </Text>
                )}
              </VStack>
            ))}
          </VStack>
        </VStack>
      )}
    </ResponsiveModal>
  );
}

// Полная замена списка вопросов: строка = вопрос, нумерация срезается.
function EditQuestionsModal({ exam, onClose }: { exam: ExamDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => exam.questions.map((question) => question.text).join("\n"));
  const parsed = parseQuestionList(text);

  const save = useMutation({
    mutationFn: () => setExamQuestions({ data: { examId: exam.id, questions: parsed } }),
    onSuccess: (result) => {
      toast.success(typo(`Сохранили вопросы: ${result.count}`));
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      onClose();
    },
    onError: (error) => {
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось сохранить вопросы");
      toast.error(humanMessage);
    },
  });

  return (
    <ResponsiveModal open onOpenChange={onClose} title={typo("Правка списка вопросов")}>
      <VStack gap="md">
        <Textarea
          value={text}
          rows={12}
          placeholder={typo("По одному вопросу в строке")}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <Text variant="mini" color="supplementary">
          {typo(`Распознано: ${questionsCountLabel(parsed.length)}. Сохранение заменяет весь список: ответы и привязка карточек сбросятся — потом перегенерируйте экзамен.`)}
        </Text>
        <HStack gap="sm">
          <Button
            disabled={save.isPending || !parsed.length}
            onClick={() => {
              save.mutate();
            }}
          >
            {typo("Сохранить")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    </ResponsiveModal>
  );
}

export function QuestionsSection({ exam }: { exam: ExamDetail }) {
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <VStack gap="md">
      <HStack justify="between" align="center" gap="sm" wrap>
        <Text variant="small" color="supplementary">
          {questionsCountLabel(exam.questions.length)}
        </Text>
        <Button
          variant="outline"
          size="sm"
          disabled={exam.status === "processing"}
          onClick={() => {
            setEditOpen(true);
          }}
        >
          {typo("Править список")}
        </Button>
      </HStack>
      {exam.questions.length ? (
        <VStack gap="sm">
          {exam.questions.map((question) => (
            <QuestionRow
              key={question.id}
              question={question}
              onOpen={() => {
                setOpenQuestionId(question.id);
              }}
            />
          ))}
        </VStack>
      ) : (
        <SimpleCard>
          <Text color="supplementary">{typo("Вопросов пока нет — добавьте список, и ИИ соберёт по нему карточки.")}</Text>
        </SimpleCard>
      )}
      {openQuestionId && (
        <QuestionModal
          questionId={openQuestionId}
          onClose={() => {
            setOpenQuestionId(null);
          }}
        />
      )}
      {editOpen && (
        <EditQuestionsModal
          exam={exam}
          onClose={() => {
            setEditOpen(false);
          }}
        />
      )}
    </VStack>
  );
}
