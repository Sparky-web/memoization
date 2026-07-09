import { ArrowDown, ArrowRight, FileText, Sparkles } from "lucide-react";

import { Heading, HStack, Text, VStack } from "~/components";
import { typo } from "~/lib";

/** Ширины строк-полосок стилизованного конспекта — имитация абзацев текста. */
const NOTE_LINE_WIDTHS: readonly string[] = ["w-11/12", "w-full", "w-4/5", "w-full", "w-2/3", "w-5/6", "w-3/5"];

/** Шаг волны подсветки строк конспекта (секунды цикла CSS-анимации). */
const LINE_DELAY_STEP_SECONDS = 0.35;

/**
 * Вопросы демо-карточек. Тема нарочно совпадает с файлом «конспект по психологии» —
 * заодно демка объясняет, на чём построен сам сервис.
 */
const DEMO_QUESTIONS: readonly string[] = [
  typo("Что такое интервальное повторение?"),
  typo("Чем рабочая память отличается от кратковременной?"),
  typo("Что показывает кривая забывания Эббингауза?"),
];

/** Пауза между появлением демо-карточек и стартовый сдвиг (секунды цикла CSS-анимации). */
const CARD_DELAY_STEP_SECONDS = 1.1;
const CARD_DELAY_OFFSET_SECONDS = 0.5;

/** Живая демка «конспект → карточки»: чистый CSS-цикл, без скриншотов и JS-анимаций. */
export function LandingDemo() {
  return (
    <section>
      <VStack gap="lg">
        <VStack gap="xs">
          <Heading variant="h2" align="center">
            {typo("Конспект превращается в карточки сам")}
          </Heading>
          <Text color="supplementary" align="center">
            {typo("Никакой ручной набивки: Claude читает файл, выделяет главное и формулирует вопросы.")}
          </Text>
        </VStack>

        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 md:flex-row md:items-stretch md:gap-6">
          {/* Стилизованный «конспект»: строки-полоски вместо скриншота */}
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-sm md:max-w-none md:flex-1">
            <VStack gap="sm">
              <HStack gap="xs" align="center">
                <FileText className="size-4 shrink-0 text-primary" />
                <Text variant="mini" color="supplementary">
                  {typo("Лекции_по_психологии.pdf")}
                </Text>
              </HStack>
              <VStack gap="xs">
                {NOTE_LINE_WIDTHS.map((widthClass, index) => (
                  <div
                    // Ширины повторяются — ключ дополняем позицией строки.
                    key={`${widthClass}-${index}`}
                    className={`landing-demo-line h-2.5 rounded-full bg-muted-foreground ${widthClass}`}
                    style={{ animationDelay: `${index * LINE_DELAY_STEP_SECONDS}s` }}
                  />
                ))}
              </VStack>
            </VStack>
          </div>

          <div className="landing-demo-flow flex shrink-0 items-center gap-1 text-primary md:flex-col md:self-center">
            <Sparkles className="size-5" />
            <ArrowDown className="size-6 md:hidden" />
            <ArrowRight className="hidden size-6 md:block" />
          </div>

          <div className="w-full max-w-md md:max-w-none md:flex-1">
            <VStack gap="sm">
              {DEMO_QUESTIONS.map((question, index) => (
                <div
                  key={question}
                  className="landing-demo-card rounded-2xl border border-border bg-card p-4 shadow-sm"
                  style={{ animationDelay: `${CARD_DELAY_OFFSET_SECONDS + index * CARD_DELAY_STEP_SECONDS}s` }}
                >
                  <VStack gap="3xs">
                    <Text variant="mini" color="supplementary">
                      {typo(`Карточка ${index + 1}`)}
                    </Text>
                    <Text variant="small" bold>
                      {question}
                    </Text>
                  </VStack>
                </div>
              ))}
              <Text variant="mini" color="supplementary" align="center">
                {typo("К каждой карточке — краткий и развёрнутый ответ")}
              </Text>
            </VStack>
          </div>
        </div>
      </VStack>
    </section>
  );
}
