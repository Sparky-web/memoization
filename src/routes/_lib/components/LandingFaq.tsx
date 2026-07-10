import { Plus } from "lucide-react";

import { Heading, Text, VStack } from "~/components";
import { FREE_QUESTIONS_PER_EXAM, typo } from "~/lib";

interface QaItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: readonly QaItem[] = [
  {
    question: typo("Что нужно, чтобы начать?"),
    answer: typo(
      "Только список вопросов и дата экзамена — всё остальное Домашник берёт на себя. Конспекты и лекции можно загрузить по желанию (Pro): тогда ответы строятся по твоим материалам с цитатой источника.",
    ),
  },
  {
    question: typo("Правда ли ИИ не выдумывает?"),
    answer: typo(
      "Честно: ИИ может ошибаться, поэтому мы не прячем это. Если загружены материалы — ответ строится по ним и ссылается на конкретный фрагмент; ответ из общих знаний помечается плашкой. Любую карточку можно отредактировать или пометить «проверить».",
    ),
  },
  {
    question: typo("Это подписка? Будут автосписания?"),
    answer: typo(
      "Нет. Все платежи разовые: оплачиваешь срок один раз, карта не привязывается. Когда срок закончится — аккаунт вернётся на бесплатный тариф, экзамены и прогресс сохранятся.",
    ),
  },
  {
    question: typo("Что бесплатно?"),
    answer: typo(
      `Один активный экзамен до ${FREE_QUESTIONS_PER_EXAM} вопросов с одной ИИ-генерацией — и всё ядро без ограничений: ежедневные сессии припоминания, план повторений к дате, честная готовность, серии. Карта не нужна.`,
    ),
  },
];

/** Мини-FAQ лендинга: нативный аккордеон на <details>, работает без JS. */
export function LandingFaq() {
  return (
    <section>
      <VStack gap="md">
        <Heading variant="h2" align="center">
          {typo("Частые вопросы")}
        </Heading>
        <VStack gap="sm" className="mx-auto w-full max-w-3xl">
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
    </section>
  );
}
