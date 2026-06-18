import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Repeat, Sparkles } from "lucide-react";

import { AdaptiveGrid, Button, Container, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: typo("Мемокарты — подготовка к экзаменам") },
      {
        name: "description",
        content: typo("Превратите список вопросов в карточки и запоминайте ответы интервальными повторениями."),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();

  return (
    <Container className="py-16">
      <VStack gap="2xl">
        <VStack gap="md" className="max-w-2xl">
          <Heading variant="h1">{typo("Готовьтесь к экзаменам с умными карточками")}</Heading>
          <Text variant="large" color="supplementary">
            {typo(
              "Превратите список вопросов в колоду карточек и запоминайте ответы интервальными повторениями: трудные вопросы возвращаются чаще, выученные — реже.",
            )}
          </Text>
          <HStack gap="sm" wrap>
            <Button
              onClick={() => {
                void navigate({ to: "/auth/signup" });
              }}
            >
              {typo("Начать бесплатно")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigate({ to: "/auth/signin" });
              }}
            >
              {typo("Войти")}
            </Button>
          </HStack>
        </VStack>

        <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md">
          <SimpleCard title={typo("1. Подготовьте вопросы")}>
            <HStack gap="sm" align="start">
              <FileText className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Скопируйте готовый промпт и попросите Клода превратить ваш файл с вопросами в пары «вопрос — ответ».")}
              </Text>
            </HStack>
          </SimpleCard>
          <SimpleCard title={typo("2. Загрузите колоду")}>
            <HStack gap="sm" align="start">
              <Sparkles className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Вставьте ответ Клода в формате JSON — обе стороны карточек сохранятся в вашей базе.")}
              </Text>
            </HStack>
          </SimpleCard>
          <SimpleCard title={typo("3. Запоминайте свайпами")}>
            <HStack gap="sm" align="start">
              <Repeat className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Вспоминайте ответ, переворачивайте карточку и свайпайте: вправо — вспомнил, влево — было трудно.")}
              </Text>
            </HStack>
          </SimpleCard>
        </AdaptiveGrid>
      </VStack>
    </Container>
  );
}
