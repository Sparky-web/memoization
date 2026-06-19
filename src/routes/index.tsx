import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BookOpen, Repeat, Sparkles } from "lucide-react";

import { AdaptiveGrid, Button, Container, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Авторизованного пользователя сразу ведём в приложение.
    const session = await getSession();
    if (session) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: typo("Мемокарты — подготовка к экзаменам") },
      {
        name: "description",
        content: typo("Соберите колоду из конспектов или вопросов — ИИ составит ответы — и учите их свайпами с интервальным повторением."),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();

  return (
    <Container className="page-enter py-16">
      <VStack gap="2xl">
        <VStack gap="md" className="max-w-2xl">
          <Heading variant="h1">{typo("Готовьтесь к экзаменам с умными карточками")}</Heading>
          <Text variant="large" color="supplementary">
            {typo(
              "Загрузите конспекты или список вопросов — ИИ соберёт колоду с краткими и развёрнутыми ответами. Учите свайпами: трудные карточки возвращаются чаще, выученные — реже.",
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
          <SimpleCard title={typo("1. Соберите колоду")}>
            <HStack gap="sm" align="start">
              <Sparkles className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Сгенерируйте карточки из конспектов, вопросов или файлов (doc, pdf, txt) — или добавьте их вручную.")}
              </Text>
            </HStack>
          </SimpleCard>
          <SimpleCard title={typo("2. Учите свайпами")}>
            <HStack gap="sm" align="start">
              <Repeat className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Переворачивайте карточку и свайпайте: вправо — вспомнил, влево — трудно. Сложное возвращается чаще.")}
              </Text>
            </HStack>
          </SimpleCard>
          <SimpleCard title={typo("3. Разбирайтесь глубже")}>
            <HStack gap="sm" align="start">
              <BookOpen className="text-primary mt-0.5 size-5 shrink-0" />
              <Text color="supplementary">
                {typo("Открывайте развёрнутые ответы с формулами и примерами и следите за прогрессом по каждой колоде.")}
              </Text>
            </HStack>
          </SimpleCard>
        </AdaptiveGrid>
      </VStack>
    </Container>
  );
}
