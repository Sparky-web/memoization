import { Plus } from "lucide-react";

import { Heading, Text, VStack } from "~/components";
import { BILLING_PLANS, typo } from "~/lib";

interface QaItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: readonly QaItem[] = [
  {
    question: typo("Это бесплатно?"),
    answer: typo(
      `Да. Ручные колоды, повторения и прохождение готовых тренажёров бесплатны и не ограничены. Первая ИИ-генерация — колода вместе с тренажёрами — в подарок; дальше нужен Pro: разовый платёж от ${BILLING_PLANS.MONTH.rub} ₽, без автосписаний.`,
    ),
  },
  {
    question: typo("Какие файлы можно загружать?"),
    answer: typo(
      "PDF, Word (doc и docx), txt, markdown, csv, json и даже фото конспекта (png, jpg) — до 5 файлов по 10 МБ за раз. Можно и без файла — просто вставить текст или список вопросов.",
    ),
  },
  {
    question: typo("Насколько точны карточки от ИИ?"),
    answer: typo(
      "Колоды собирает Claude — он опирается на твой конспект, а не на «знания из интернета». Любую карточку можно отредактировать, а спорный ответ — уточнить в чате прямо на карточке.",
    ),
  },
  {
    question: typo("Можно ли просто вставить свои карточки?"),
    answer: typo(
      "Да, без ограничений: вставь пары «вопрос — ответ» — и колода готова. Повторения работают с ручными колодами так же, как с ИИ-колодами, а тренажёры к ним генерирует Claude: первая генерация бесплатна, дальше нужен Pro.",
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
