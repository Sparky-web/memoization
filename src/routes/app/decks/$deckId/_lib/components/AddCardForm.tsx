import { useState } from "react";
import { toast } from "sonner";

import { Button, HStack, Label, Textarea, VStack } from "~/components";
import { typo } from "~/lib";

import { useAddCard } from "../model/deckMutations";

interface AddCardFormProps {
  deckId: string;
}

export function AddCardForm({ deckId }: AddCardFormProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerDeep, setAnswerDeep] = useState("");
  const add = useAddCard(deckId);

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast.error(typo("Заполните вопрос и ответ"));
      return;
    }
    add.mutate(
      { question: question.trim(), answer: answer.trim(), answerDeep: answerDeep.trim() || null },
      {
        onSuccess: () => {
          setQuestion("");
          setAnswer("");
          setAnswerDeep("");
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap="sm" className="bg-card rounded-2xl p-4">
        <div>
          <Label htmlFor="new-question">{typo("Вопрос")}</Label>
          <Textarea
            id="new-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="new-answer">{typo("Краткий ответ")}</Label>
          <Textarea
            id="new-answer"
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="new-answer-deep">{typo("Развёрнутый ответ — markdown, необязательно")}</Label>
          <Textarea
            id="new-answer-deep"
            className="min-h-24 font-mono"
            value={answerDeep}
            onChange={(event) => {
              setAnswerDeep(event.target.value);
            }}
          />
        </div>
        <HStack>
          <Button type="submit" disabled={add.isPending}>
            {typo("Добавить карточку")}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
}
