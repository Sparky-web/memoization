import { Button, HStack, ProgressBar, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { cardsCountLabel, type ExamDetail } from "../../../_lib";

// Готовность по темам: слабые (< 60%) подсвечиваются предупреждающим цветом и идут первыми.

const WEAK_THRESHOLD = 0.6;

interface TopicsSectionProps {
  exam: ExamDetail;
  onPretest: () => void;
}

export function TopicsSection({ exam, onPretest }: TopicsSectionProps) {
  const topics = [...exam.topics].sort((left, right) => left.readiness - right.readiness);
  const hasNewCards = exam.counters.new > 0;

  if (!topics.length) {
    return (
      <SimpleCard>
        <Text color="supplementary">
          {typo("Темы появятся после генерации: ИИ сгруппирует вопросы в кластеры и посчитает готовность по каждому.")}
        </Text>
      </SimpleCard>
    );
  }

  return (
    <VStack gap="md">
      {hasNewCards && (
        <SimpleCard>
          <HStack justify="between" align="center" gap="md" wrap>
            <VStack gap="3xs">
              <Text bold>{typo("Сначала бой: претест по новым темам")}</Text>
              <Text variant="mini" color="supplementary">
                {typo(
                  "Попробуй ответить до изучения — ошибаться сейчас нормально и полезно, так материал запомнится лучше.",
                )}
              </Text>
            </VStack>
            <Button variant="outline" size="sm" onClick={onPretest}>
              {typo("Пройти претест")}
            </Button>
          </HStack>
        </SimpleCard>
      )}
      <SimpleCard>
        <VStack gap="sm">
          {topics.map((topic) => {
            const weak = topic.readiness < WEAK_THRESHOLD;
            return (
              <VStack key={topic.topic ?? "-"} gap="3xs">
                <HStack justify="between" align="center" gap="sm" wrap>
                  <Text variant="small" bold={weak} color={weak ? "main" : "supplementary"}>
                    {topic.topic ? typo(topic.topic) : typo("Без темы")}
                  </Text>
                  <Text variant="mini" color="supplementary">
                    {typo(`${Math.round(topic.readiness * 100)}% · ${cardsCountLabel(topic.cardCount)}`)}
                  </Text>
                </HStack>
                <ProgressBar value={topic.readiness} tone={weak ? "warning" : "success"} />
              </VStack>
            );
          })}
        </VStack>
        <Text variant="mini" color="supplementary">
          {typo("Оранжевые темы — готовность ниже 60%: они будут чаще попадать в сессии.")}
        </Text>
      </SimpleCard>
    </VStack>
  );
}
