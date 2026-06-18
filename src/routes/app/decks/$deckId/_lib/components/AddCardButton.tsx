import { useState } from "react";

import { Button, HStack } from "~/components";
import { typo } from "~/lib";

import { useAddCard } from "../model/deckMutations";
import { CardFormModal } from "./CardFormModal";

interface AddCardButtonProps {
  deckId: string;
}

const EMPTY_CARD: { question: string; answer: string; answerDeep: string } = { question: "", answer: "", answerDeep: "" };

export function AddCardButton({ deckId }: AddCardButtonProps) {
  const [open, setOpen] = useState(false);
  // formKey растёт при каждом открытии — пере-монтирует форму и очищает поля,
  // в том числе после успешного добавления (вместо ручного reset через useEffect).
  const [formKey, setFormKey] = useState(0);
  const add = useAddCard(deckId);

  const openModal = () => {
    setFormKey((current) => current + 1);
    setOpen(true);
  };

  return (
    <HStack>
      <Button onClick={openModal}>{typo("Добавить карточку")}</Button>
      <CardFormModal
        open={open}
        onOpenChange={setOpen}
        formKey={formKey}
        title={typo("Новая карточка")}
        submitLabel={typo("Добавить карточку")}
        initialValues={EMPTY_CARD}
        pending={add.isPending}
        onSubmit={(result, options) => {
          add.mutate(result, options);
        }}
      />
    </HStack>
  );
}
