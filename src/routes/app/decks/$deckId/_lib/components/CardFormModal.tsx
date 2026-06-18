import { useId, useState } from "react";
import { toast } from "sonner";

import { Button, HStack, Label, ResponsiveModal, Textarea, VStack } from "~/components";
import { typo } from "~/lib";

// Поля формы: пустой answerDeep означает «нет развёрнутого ответа».
interface CardFormValues {
  question: string;
  answer: string;
  answerDeep: string;
}

// Результат для мутаций: пустой развёрнутый ответ схлопывается в null.
interface CardFormResult {
  question: string;
  answer: string;
  answerDeep: string | null;
}

interface CardFormFieldsProps {
  submitLabel: string;
  initialValues: CardFormValues;
  pending: boolean;
  onSubmit: (result: CardFormResult, options: { onSuccess: () => void }) => void;
  onDone: () => void;
}

// Внутренний компонент с состоянием формы. Родитель меняет ему key при каждом
// открытии — так поля пере-инициализируются из initialValues без useEffect,
// а сама модалка остаётся смонтированной (анимация открытия не ломается).
function CardFormFields({ submitLabel, initialValues, pending, onSubmit, onDone }: CardFormFieldsProps) {
  const fieldId = useId();
  const [question, setQuestion] = useState(initialValues.question);
  const [answer, setAnswer] = useState(initialValues.answer);
  const [answerDeep, setAnswerDeep] = useState(initialValues.answerDeep);

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast.error(typo("Заполните вопрос и ответ"));
      return;
    }
    onSubmit(
      { question: question.trim(), answer: answer.trim(), answerDeep: answerDeep.trim() || null },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap="sm">
        <div>
          <Label htmlFor={`${fieldId}-question`}>{typo("Вопрос")}</Label>
          <Textarea
            id={`${fieldId}-question`}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-answer`}>{typo("Краткий ответ")}</Label>
          <Textarea
            id={`${fieldId}-answer`}
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-deep`}>{typo("Развёрнутый ответ — markdown, необязательно")}</Label>
          <Textarea
            id={`${fieldId}-deep`}
            className="min-h-24 font-mono"
            value={answerDeep}
            onChange={(event) => {
              setAnswerDeep(event.target.value);
            }}
          />
        </div>
        <HStack>
          <Button type="submit" disabled={pending}>
            {submitLabel}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
}

interface CardFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialValues: CardFormValues;
  pending: boolean;
  /** Растёт при каждом открытии — пере-монтирует поля и сбрасывает их к initialValues. */
  formKey: number;
  // Мутацию выбирает родитель (add / update); модалка про неё ничего не знает.
  onSubmit: (result: CardFormResult, options: { onSuccess: () => void }) => void;
}

// Общая адаптивная модалка добавления/редактирования карточки.
export function CardFormModal({ open, onOpenChange, title, submitLabel, initialValues, pending, formKey, onSubmit }: CardFormModalProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title}>
      <CardFormFields
        key={formKey}
        submitLabel={submitLabel}
        initialValues={initialValues}
        pending={pending}
        onSubmit={onSubmit}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </ResponsiveModal>
  );
}
