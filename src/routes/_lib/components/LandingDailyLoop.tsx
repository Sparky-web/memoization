import { Brain, CalendarCheck, Gauge } from "lucide-react";

import { AdaptiveGrid, Container, Heading, HStack, ReadinessRing, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { riseDelay } from "../lib/motion";

/** Позиция ползунка уверенности в мокапе сессии (доля ширины). */
const CONFIDENCE_DEMO = 0.65;

/** Мокап плана дня: блоки экзаменов с количеством карточек. */
const PLAN_ROWS: readonly { title: string; cards: string }[] = [
  { title: typo("Физика"), cards: typo("14 карточек") },
  { title: typo("Информатика"), cards: typo("8 карточек") },
];

/** Готовность в демо-кольце: честные 73%, как на экране готовности. */
const READINESS_DEMO = 0.73;

/** Шапка шага ежедневного цикла: иконка в плитке + тихий номер шага. */
function StepHead({ icon: Icon, step }: { icon: typeof Brain; step: string }) {
  return (
    <HStack justify="between" align="center" gap="sm">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="font-headings font-extrabold text-muted-foreground/50 tabular-nums">{step}</span>
    </HStack>
  );
}

/** «Что даёт каждый день»: план дня → сессия припоминания с уверенностью → честная готовность. */
export function LandingDailyLoop() {
  return (
    <section>
      <Container className="py-10 md:py-16">
        <VStack gap="xl">
          <VStack gap="sm">
            <Heading variant="h2" align="center">
              {typo("Что даёт каждый день")}
            </Heading>
            <Text color="supplementary" align="center">
              {typo("Короткий ежедневный ритм — около 25 минут. Всё остальное приложение считает само.")}
            </Text>
          </VStack>

          <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md" align="stretch">
            {/* 1. План дня */}
            <SimpleCard className="lift rise h-full" style={riseDelay(0)}>
              <VStack gap="sm">
                <StepHead icon={CalendarCheck} step="01" />
                <Heading variant="h4" asParagraph>
                  {typo("План дня")}
                </Heading>
                <Text variant="small" color="supplementary">
                  {typo("Домашник сам решает, что показать сегодня: просроченное, слабые темы, немного нового.")}
                </Text>
                <div className="rounded-xl bg-muted/60 p-3">
                  <VStack gap="xs">
                    {PLAN_ROWS.map((row) => (
                      <HStack key={row.title} justify="between" align="center" gap="sm">
                        <Text variant="small" bold>
                          {row.title}
                        </Text>
                        <Text variant="mini" color="supplementary">
                          {row.cards}
                        </Text>
                      </HStack>
                    ))}
                    <Text variant="mini" color="supplementary">
                      {typo("≈ 25 минут · темы вперемешку")}
                    </Text>
                  </VStack>
                </div>
              </VStack>
            </SimpleCard>

            {/* 2. Сессия припоминания: мини-мокап карточки с ползунком уверенности */}
            <SimpleCard className="lift rise h-full" style={riseDelay(1)}>
              <VStack gap="sm">
                <StepHead icon={Brain} step="02" />
                <Heading variant="h4" asParagraph>
                  {typo("Сессия припоминания")}
                </Heading>
                <Text variant="small" color="supplementary">
                  {typo("Сначала вспоминаешь сам и отмечаешь уверенность — только потом видишь ответ и объяснение.")}
                </Text>
                <div className="rounded-xl bg-muted/60 p-3">
                  <VStack gap="xs">
                    <Text variant="small" bold>
                      {typo("Сформулируй закон сохранения импульса")}
                    </Text>
                    <VStack gap="3xs">
                      <div className="relative h-2 rounded-full bg-muted-foreground/25">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-brand-gradient"
                          style={{ width: `${CONFIDENCE_DEMO * 100}%` }}
                        />
                        <span
                          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-card"
                          style={{ left: `${CONFIDENCE_DEMO * 100}%` }}
                        />
                      </div>
                      <HStack justify="between" align="center">
                        <Text variant="mini" color="supplementary">
                          {typo("уверенность")}
                        </Text>
                        <Text variant="mini" bold>
                          {Math.round(CONFIDENCE_DEMO * 100)}%
                        </Text>
                      </HStack>
                    </VStack>
                    <Text variant="mini" color="supplementary">
                      {typo("Уверенные промахи уходят в приоритет — они исправляются лучше всего")}
                    </Text>
                  </VStack>
                </div>
              </VStack>
            </SimpleCard>

            {/* 3. Честная готовность */}
            <SimpleCard className="lift rise h-full" style={riseDelay(2)}>
              <VStack gap="sm">
                <StepHead icon={Gauge} step="03" />
                <Heading variant="h4" asParagraph>
                  {typo("Честная готовность")}
                </Heading>
                <Text variant="small" color="supplementary">
                  {typo(
                    "Готовность считается по реальному припоминанию: «вспомнил 12 из 20», а не «позанимался 40 минут».",
                  )}
                </Text>
                <div className="rounded-xl bg-muted/60 p-3">
                  <HStack gap="md" align="center">
                    <ReadinessRing value={READINESS_DEMO} size="lg" />
                    <VStack gap="3xs">
                      <Text variant="small" bold>
                        {typo("До экзамена 9 дней")}
                      </Text>
                      <Text variant="mini" color="supplementary">
                        {typo("148 карточек освоено из 203")}
                      </Text>
                      <Text variant="mini" color="supplementary">
                        {typo("2 слабые темы — их покажем чаще")}
                      </Text>
                    </VStack>
                  </HStack>
                </div>
              </VStack>
            </SimpleCard>
          </AdaptiveGrid>
        </VStack>
      </Container>
    </section>
  );
}
