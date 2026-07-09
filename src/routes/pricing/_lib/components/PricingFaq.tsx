import { Plus } from "lucide-react";

import { Heading, Text, VStack } from "~/components";
import { FREE_CHAT_PER_DAY, PRO_CHAT_PER_DAY, PRO_DECK_GENERATIONS_PER_DAY, typo } from "~/lib";

import { SUPPORT_EMAIL } from "../../../_lib";

interface QaItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: readonly QaItem[] = [
  {
    question: typo("Это подписка? Будут автосписания?"),
    answer: typo(
      "Нет. Платёж разовый: оплачиваете выбранный срок один раз, карта не привязывается. Когда срок закончится, доступ просто вернётся на бесплатный тариф — отменять ничего не нужно.",
    ),
  },
  {
    question: typo("Что входит в Pro?"),
    answer: typo(
      `До ${PRO_DECK_GENERATIONS_PER_DAY} ИИ-генераций колод в день, генерация тренажёров («вставь слово» и тесты) без ограничений и до ${PRO_CHAT_PER_DAY} сообщений чата по карточкам в день.`,
    ),
  },
  {
    question: typo("Что останется бесплатным?"),
    answer: typo(
      `Колоды вручную (JSON-импорт), повторения свайпами и тренажёры — без ограничений. Плюс одна ИИ-генерация колоды, одна генерация тренажёров и ${FREE_CHAT_PER_DAY} сообщений чата в день. Pro нужен только для дорогого ИИ.`,
    ),
  },
  {
    question: typo("Как проходит оплата?"),
    answer: typo(
      "Через ЮKassa — СБП или банковской картой. Реквизиты карты мы не видим и не храним, чек придёт на почту. Доступ открывается сразу после оплаты.",
    ),
  },
  {
    question: typo("Как вернуть деньги?"),
    answer: typo(
      `Напишите на ${SUPPORT_EMAIL} — вернём пропорционально неиспользованным дням оплаченного периода тем же способом, которым платили. Подробности — в оферте.`,
    ),
  },
];

/** Частые вопросы про оплату: нативный аккордеон на <details>, работает без JS. */
export function PricingFaq() {
  return (
    <VStack gap="md">
      <Heading variant="h2" align="center">
        {typo("Частые вопросы")}
      </Heading>
      <VStack gap="sm">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group rounded-2xl border border-border bg-card p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <Heading variant="h4" asParagraph>
                {item.question}
              </Heading>
              <Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" />
            </summary>
            <div className="pt-3">
              <Text variant="small" color="supplementary">
                {item.answer}
              </Text>
            </div>
          </details>
        ))}
      </VStack>
    </VStack>
  );
}
