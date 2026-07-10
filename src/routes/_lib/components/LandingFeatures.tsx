import { Layers, Mic, MoonStar, Network, Target, Users } from "lucide-react";

import { AdaptiveGrid, Badge, Container, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { riseDelay } from "../lib/motion";

interface LandingFeature {
  icon: typeof Mic;
  title: string;
  description: string;
  pro: boolean;
}

const FEATURES: readonly LandingFeature[] = [
  {
    icon: Mic,
    title: typo("Голосовой «объясни ученику»"),
    description: typo(
      "Объясняешь тему ИИ-студенту голосом, он наивно переспрашивает «а почему?» — пробелы в понимании вылезают мгновенно.",
    ),
    pro: true,
  },
  {
    icon: MoonStar,
    title: typo("Умная зубрёжка с защитой сна"),
    description: typo(
      "Когда до экзамена день-два: спринты по слабым темам и частые повторы ошибок. Ночью — спать: память записывается во сне.",
    ),
    pro: true,
  },
  {
    icon: Target,
    title: typo("Прогноз против факта"),
    description: typo(
      "Предскажи свой результат — потом сравни с реальностью. Самоуверенность видна на графике, и ей перестаёшь верить.",
    ),
    pro: false,
  },
  {
    icon: Network,
    title: typo("Карты связей и дворец памяти"),
    description: typo(
      "Для упрямого материала: схема понятий своими руками и маршрут с яркими образами для списков и последовательностей.",
    ),
    pro: false,
  },
  {
    icon: Layers,
    title: typo("Несколько экзаменов — один план"),
    description: typo(
      "Сессия сама делит время между предметами: чем ближе дата и ниже готовность, тем больше внимания экзамену.",
    ),
    pro: true,
  },
  {
    icon: Users,
    title: typo("Публичный экзамен для группы"),
    description: typo("Поделись экзаменом по ссылке — каждый заберёт себе копию со своей датой и своим прогрессом."),
    pro: false,
  },
];

/** Сетка ключевых возможностей поверх ежедневного ядра: голос, зубрёжка, метапознание, мнемоники. */
export function LandingFeatures() {
  return (
    <section>
      <Container className="py-10 md:py-16">
        <VStack gap="xl">
          <VStack gap="sm">
            <Heading variant="h2" align="center">
              {typo("Больше, чем карточки")}
            </Heading>
            <Text color="supplementary" align="center">
              {typo("Всё, что помогает довести себя до усилия — и не обмануться по дороге.")}
            </Text>
          </VStack>
          <AdaptiveGrid cols={{ base: 1, md: 2, lg: 3 }} gap="md" align="stretch">
            {FEATURES.map((feature, featureIndex) => (
              <SimpleCard key={feature.title} className="h-full lift rise" style={riseDelay(featureIndex)}>
                <VStack gap="sm">
                  <HStack justify="between" align="center" gap="sm">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <feature.icon className="size-5" strokeWidth={1.8} />
                    </span>
                    {feature.pro && <Badge variant="primary">Pro</Badge>}
                  </HStack>
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
      </Container>
    </section>
  );
}
