import { ArrowDown, ArrowRight, CalendarDays, FileQuestion, Quote, Sparkles } from "lucide-react";

import { Badge, Container, Heading, HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

/**
 * Вопросы демо-экзамена. Тема нарочно «про память» — заодно демка объясняет,
 * на чём построен сам сервис.
 */
const DEMO_QUESTIONS: readonly string[] = [
  typo("1. Кривая забывания Эббингауза"),
  typo("2. Что такое активное припоминание?"),
  typo("3. Интервальные повторения и их эффект"),
];

/** Пауза между появлением артефактов генерации и стартовый сдвиг (секунды цикла CSS-анимации). */
const STAGE_DELAY_STEP_SECONDS = 1.4;
const STAGE_DELAY_OFFSET_SECONDS = 0.5;

/** Мини-календарь плана: сколько карточек назначено на день; последний день — экзамен. */
const PLAN_DAYS: readonly { label: string; dots: number; exam: boolean }[] = [
  { label: typo("пн"), dots: 2, exam: false },
  { label: typo("вт"), dots: 1, exam: false },
  { label: typo("ср"), dots: 3, exam: false },
  { label: typo("чт"), dots: 1, exam: false },
  { label: typo("пт"), dots: 2, exam: false },
  { label: typo("сб"), dots: 3, exam: false },
  { label: typo("вс"), dots: 0, exam: true },
];

function stageDelay(index: number): { animationDelay: string } {
  return { animationDelay: `${STAGE_DELAY_OFFSET_SECONDS + index * STAGE_DELAY_STEP_SECONDS}s` };
}

/** Живая демка «вопросы → ответ с цитатой → карточка → план к дате»: чистый CSS-цикл, без JS-анимаций. */
export function LandingDemo() {
  return (
    <section>
      <Container className="py-10 md:py-16">
        <VStack gap="xl">
          <VStack gap="sm">
            <Heading variant="h2" align="center">
              {typo("Как это работает")}
            </Heading>
            <Text color="supplementary" align="center">
              {typo("Один раз вставляешь вопросы — дальше Домашник сам готовит ответы, карточки и расписание.")}
            </Text>
          </VStack>

          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 md:flex-row md:items-stretch md:gap-6">
            {/* Вход: список вопросов и дата — всё, что нужно от пользователя */}
            <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-card lift md:max-w-none md:flex-1">
              <VStack gap="sm">
                <HStack gap="xs" align="center">
                  <FileQuestion className="size-5 shrink-0 text-primary" strokeWidth={1.8} />
                  <Text variant="mini" color="supplementary">
                    {typo("Вопросы к экзамену")}
                  </Text>
                </HStack>
                <VStack gap="xs">
                  {DEMO_QUESTIONS.map((question) => (
                    <Text key={question} variant="small">
                      {question}
                    </Text>
                  ))}
                  <Text variant="mini" color="supplementary">
                    {typo("…ещё 57 вопросов")}
                  </Text>
                </VStack>
                <HStack gap="xs" align="center">
                  <CalendarDays className="size-5 shrink-0 text-primary" strokeWidth={1.8} />
                  <Text variant="mini" color="supplementary">
                    {typo("Экзамен — 26 июля")}
                  </Text>
                </HStack>
              </VStack>
            </div>

            <div className="landing-demo-flow flex shrink-0 items-center gap-1 text-primary md:flex-col md:self-center">
              <Sparkles className="size-5" strokeWidth={1.8} />
              <ArrowDown className="size-6 md:hidden" strokeWidth={1.8} />
              <ArrowRight className="hidden size-6 md:block" strokeWidth={1.8} />
            </div>

            {/* Выход: ответ с цитатой → атомарная карточка → план повторений к дате */}
            <div className="w-full max-w-md md:max-w-none md:flex-1">
              <VStack gap="sm">
                <div className="landing-demo-card rounded-2xl bg-card p-4 shadow-card lift" style={stageDelay(0)}>
                  <VStack gap="3xs">
                    <Text variant="mini" color="supplementary">
                      {typo("Ответ на вопрос 2")}
                    </Text>
                    <Text variant="small" bold>
                      {typo("Активное припоминание — самостоятельное извлечение знания из памяти без подсказки…")}
                    </Text>
                    {/* Привязка к конспектам — возможность Pro: бейдж честно предупреждает об этом ещё на лендинге. */}
                    <HStack gap="xs" align="center">
                      <Quote className="size-3.5 shrink-0 text-primary" strokeWidth={1.8} />
                      <Text variant="mini" color="supplementary">
                        {typo("Из твоего конспекта: Лекции_по_психологии.pdf")}
                      </Text>
                      <Badge variant="primary">Pro</Badge>
                    </HStack>
                  </VStack>
                </div>

                <div className="landing-demo-card rounded-2xl bg-card p-4 shadow-card lift" style={stageDelay(1)}>
                  <VStack gap="3xs">
                    <Text variant="mini" color="supplementary">
                      {typo("Карточка · один факт")}
                    </Text>
                    <Text variant="small" bold>
                      {typo("Чем припоминание полезнее перечитывания?")}
                    </Text>
                  </VStack>
                </div>

                <div className="landing-demo-card rounded-2xl bg-card p-4 shadow-card lift" style={stageDelay(2)}>
                  <VStack gap="xs">
                    <Text variant="mini" color="supplementary">
                      {typo("План повторений — точно к дате")}
                    </Text>
                    <HStack gap="xs" justify="between">
                      {PLAN_DAYS.map((day) => (
                        <VStack key={day.label} gap="3xs" align="center">
                          <span
                            className={
                              day.exam
                                ? "flex size-8 items-center justify-center rounded-lg bg-brand-gradient"
                                : "flex size-8 items-center justify-center gap-0.5 rounded-lg bg-muted"
                            }
                          >
                            {day.exam ? (
                              <span className="text-brand-foreground">
                                <Text variant="mini" bold>
                                  {typo("экз")}
                                </Text>
                              </span>
                            ) : (
                              Array.from({ length: day.dots }, (_slot, dotIndex) => (
                                <span key={dotIndex} className="size-1.5 rounded-full bg-primary" />
                              ))
                            )}
                          </span>
                          <Text variant="mini" color="supplementary">
                            {day.label}
                          </Text>
                        </VStack>
                      ))}
                    </HStack>
                  </VStack>
                </div>

                <Text variant="mini" color="supplementary" align="center">
                  {typo("Ответы и карточки можно править — спорное помечается «проверить»")}
                </Text>
              </VStack>
            </div>
          </div>
        </VStack>
      </Container>
    </section>
  );
}
