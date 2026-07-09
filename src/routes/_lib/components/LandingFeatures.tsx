import { ChartLine, ListChecks, MessagesSquare, PenLine, Smartphone, Users } from "lucide-react";

import { AdaptiveGrid, Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

interface LandingFeature {
  icon: typeof PenLine;
  title: string;
  description: string;
}

const FEATURES: readonly LandingFeature[] = [
  {
    icon: PenLine,
    title: typo("Тренажёр «Вставь слово»"),
    description: typo(
      "Пропущенный термин надо вписать самому — формулировки запоминаются точнее, чем при перечитывании.",
    ),
  },
  {
    icon: ListChecks,
    title: typo("Тесты по колоде"),
    description: typo(
      "Вопросы с вариантами ответов собираются из твоих же карточек — репетиция экзамена без репетитора.",
    ),
  },
  {
    icon: MessagesSquare,
    title: typo("Чат с ИИ по карточке"),
    description: typo("Непонятен ответ — спроси прямо на карточке: Claude объяснит проще и приведёт пример."),
  },
  {
    icon: Users,
    title: typo("Одна колода — на всю группу"),
    description: typo("Поделись колодой по ссылке: сделал один — учат все, прогресс у каждого свой."),
  },
  {
    icon: ChartLine,
    title: typo("Статистика и прогноз"),
    description: typo(
      "Видно, что уже в памяти, что «горит» и сколько повторений ждёт завтра — без сюрпризов перед экзаменом.",
    ),
  },
  {
    icon: Smartphone,
    title: typo("Живёт в телефоне"),
    description: typo(
      "Открывается как приложение (PWA): повторяй в автобусе, в очереди и на паре — без установки из стора.",
    ),
  },
];

/** Сетка ключевых возможностей: тренажёры, чат, публичные колоды, статистика, PWA. */
export function LandingFeatures() {
  return (
    <section>
      <VStack gap="lg">
        <VStack gap="xs">
          <Heading variant="h2" align="center">
            {typo("Больше, чем карточки")}
          </Heading>
          <Text color="supplementary" align="center">
            {typo("Всё, что нужно между «загрузил конспект» и «сдал».")}
          </Text>
        </VStack>
        <AdaptiveGrid cols={{ base: 1, md: 2, lg: 3 }} gap="md" align="stretch">
          {FEATURES.map((feature) => (
            <SimpleCard key={feature.title} className="h-full border border-border">
              <VStack gap="sm">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <feature.icon className="size-5" />
                </span>
                <Heading variant="h4" asParagraph>
                  {feature.title}
                </Heading>
                <Text variant="small" color="supplementary">
                  {feature.description}
                </Text>
              </VStack>
            </SimpleCard>
          ))}
        </AdaptiveGrid>
      </VStack>
    </section>
  );
}
