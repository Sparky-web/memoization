import { CalendarClock, FileUp, WandSparkles } from "lucide-react";

import { AdaptiveGrid, Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

interface LandingStep {
  icon: typeof FileUp;
  title: string;
  description: string;
}

const STEPS: readonly LandingStep[] = [
  {
    icon: FileUp,
    title: typo("1. Загрузи конспект, лекции или список вопросов"),
    description: typo("Файлом — pdf, word, txt, даже фото тетради — или просто вставь текст."),
  },
  {
    icon: WandSparkles,
    title: typo("2. Claude превратит их в карточки и тренажёры"),
    description: typo(
      "Через несколько минут готова колода: вопросы, краткие и развёрнутые ответы, тесты и «вставь слово».",
    ),
  },
  {
    icon: CalendarClock,
    title: typo("3. Повторяй по расписанию"),
    description: typo("Система сама напомнит, что начинает забываться: сложное возвращается чаще, выученное — реже."),
  },
];

/** «Как это работает» — три шага от файла до сданного экзамена. */
export function LandingSteps() {
  return (
    <section>
      <VStack gap="lg">
        <Heading variant="h2" align="center">
          {typo("Как это работает")}
        </Heading>
        <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md" align="stretch">
          {STEPS.map((step) => (
            <SimpleCard key={step.title} className="h-full border border-border">
              <VStack gap="sm">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <step.icon className="size-5" />
                </span>
                <Heading variant="h4" asParagraph>
                  {step.title}
                </Heading>
                <Text variant="small" color="supplementary">
                  {step.description}
                </Text>
              </VStack>
            </SimpleCard>
          ))}
        </AdaptiveGrid>
      </VStack>
    </section>
  );
}
