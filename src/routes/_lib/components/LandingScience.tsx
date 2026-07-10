import { FlaskConical } from "lucide-react";

import { Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

/** Наука кратко: почему припоминание и интервалы, без академической тяжести. */
export function LandingScience() {
  return (
    <section>
      <SimpleCard size="lg" className="border border-border">
        <VStack gap="md" justify="center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <FlaskConical className="size-6" />
          </span>
          <VStack gap="xs" justify="center">
            <Heading variant="h2" align="center">
              {typo("Почему это работает")}
            </Heading>
            <div className="mx-auto max-w-2xl">
              <VStack gap="sm">
                <Text color="supplementary" align="center">
                  {typo(
                    "Активное припоминание и интервальные повторения — две техники с высшей оценкой полезности в большом обзоре методов обучения. Перечитывание и подчёркивание — в конце того же списка.",
                  )}
                </Text>
                <Text color="supplementary" align="center">
                  {typo(
                    "Поэтому весь Домашник устроен по принципу «сначала вспомни — потом смотри ответ»: память любит усилие, а расписание повторений пересчитывается после каждого твоего ответа.",
                  )}
                </Text>
              </VStack>
            </div>
          </VStack>
          <Text variant="mini" color="supplementary" align="center">
            {typo("Dunlosky et al. (2013) · Cepeda et al. (2008) · планировщик FSRS")}
          </Text>
        </VStack>
      </SimpleCard>
    </section>
  );
}
