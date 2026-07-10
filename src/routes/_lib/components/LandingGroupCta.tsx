import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { Button, Container, Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

/** Акцент на вирусную механику: экзамен по ссылке форкает вся группа, у каждого свой план. */
export function LandingGroupCta() {
  const navigate = useNavigate();

  return (
    <section>
      <Container className="py-10 md:py-16">
        <SimpleCard size="lg" className="rise bg-accent/60">
          <VStack gap="md" justify="center" className="py-2 md:py-4">
            <span className="flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-card">
              <Users className="size-6" strokeWidth={1.8} />
            </span>
            <VStack gap="sm" justify="center">
              <Heading variant="h2" align="center">
                {typo("Готовитесь группой?")}
              </Heading>
              <div className="max-w-2xl">
                <Text color="supplementary" align="center">
                  {typo(
                    "Один вставляет вопросы — остальные забирают экзамен по ссылке себе. Карточки общие, а дата, план и прогресс у каждого свои. Сделал староста — готовится вся группа.",
                  )}
                </Text>
              </div>
            </VStack>
            <Button size="pill" onClick={() => void navigate({ to: "/auth/signup" })}>
              {typo("Собрать экзамен для группы")}
            </Button>
          </VStack>
        </SimpleCard>
      </Container>
    </section>
  );
}
