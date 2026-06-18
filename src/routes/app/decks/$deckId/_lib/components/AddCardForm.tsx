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
  const add = useAddCard(deckId);

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast.error(typo("Заполните вопрос и ответ"));
      return;
    }
    add.mutate(
      { question: question.trim(), answer: answer.trim() },
      {
        onSuccess: () => {
          setQuestion("");
          setAnswer("");
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
          <Label htmlFor="new-answer">{typo("Ответ")}</Label>
          <Textarea
            id="new-answer"
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
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
