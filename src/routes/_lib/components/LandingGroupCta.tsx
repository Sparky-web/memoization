import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { Button, Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

/** Акцент на вирусную механику: одну публичную колоду учит вся группа по ссылке. */
export function LandingGroupCta() {
  const navigate = useNavigate();

  return (
    <section>
      <SimpleCard size="lg" className="border border-primary/25 bg-primary/10">
        <VStack gap="md" justify="center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Users className="size-6" />
          </span>
          <VStack gap="xs" justify="center">
            <Heading variant="h2" align="center">
              {typo("Готовитесь группой?")}
            </Heading>
            <div className="max-w-2xl">
              <Text color="supplementary" align="center">
                {typo(
                  "Один загружает конспект — все учат по ссылке: карточки общие, прогресс у каждого свой. Сделал староста — сдаёт вся группа.",
                )}
              </Text>
            </div>
          </VStack>
          <Button size="pill" onClick={() => void navigate({ to: "/auth/signup" })}>
            {typo("Сделать колоду для группы")}
          </Button>
        </VStack>
      </SimpleCard>
    </section>
  );
}
