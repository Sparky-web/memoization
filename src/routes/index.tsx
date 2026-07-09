import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BookOpen, Repeat, Sparkles } from "lucide-react";

import { AdaptiveGrid, Button, Container, Heading, HStack, Link, SimpleCard, Text, VStack } from "~/components";
import { BILLING_PLAN_IDS, BILLING_PLANS, type BillingPlanId, typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

import { SELLER_REQUISITES, SUPPORT_EMAIL } from "./_lib/lib/marketing";

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
        content: typo(
          "Соберите колоду из конспектов или вопросов — ИИ составит ответы — и учите их свайпами с интервальным повторением.",
        ),
      },
    ],
  }),
  component: HomePage,
});

interface LandingPlan {
  id: BillingPlanId;
  title: string;
  price: string;
  days: string;
  hero: boolean;
}

// Компактная витрина тарифов для лендинга: детали и покупка — на /pricing
const LANDING_PLANS: readonly LandingPlan[] = BILLING_PLAN_IDS.map((planId) => ({
  id: planId,
  title: BILLING_PLANS[planId].title,
  price: typo(`${BILLING_PLANS[planId].rub} ₽`),
  days: typo(`${BILLING_PLANS[planId].days} дней`),
  hero: planId === "TERM",
}));

function HomePage() {
  const navigate = useNavigate();
  const goPricing = () => void navigate({ to: "/pricing" });

  return (
    <div>
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
            <Text variant="small" color="supplementary">
              {typo("Первая ИИ-генерация колоды — бесплатно; ручные колоды и повторения не ограничены.")}
            </Text>
          </VStack>

          <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md">
            <SimpleCard title={typo("1. Соберите колоду")}>
              <HStack gap="sm" align="start">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
                <Text color="supplementary">
                  {typo(
                    "Сгенерируйте карточки из конспектов, вопросов или файлов (doc, pdf, txt) — или добавьте их вручную.",
                  )}
                </Text>
              </HStack>
            </SimpleCard>
            <SimpleCard title={typo("2. Учите свайпами")}>
              <HStack gap="sm" align="start">
                <Repeat className="mt-0.5 size-5 shrink-0 text-primary" />
                <Text color="supplementary">
                  {typo(
                    "Переворачивайте карточку и свайпайте: вправо — вспомнил, влево — трудно. Сложное возвращается чаще.",
                  )}
                </Text>
              </HStack>
            </SimpleCard>
            <SimpleCard title={typo("3. Разбирайтесь глубже")}>
              <HStack gap="sm" align="start">
                <BookOpen className="mt-0.5 size-5 shrink-0 text-primary" />
                <Text color="supplementary">
                  {typo(
                    "Открывайте развёрнутые ответы с формулами и примерами и следите за прогрессом по каждой колоде.",
                  )}
                </Text>
              </HStack>
            </SimpleCard>
          </AdaptiveGrid>

          {/* Тарифы */}
          <VStack gap="lg">
            <VStack gap="xs">
              <Heading variant="h2" align="center">
                {typo("Бесплатно — карточки и повторения. Pro — ИИ без лимитов")}
              </Heading>
              <Text color="supplementary" align="center">
                {typo(
                  "Разовый платёж без автосписаний. Генерация колод, тренажёры и чат по карточкам — на всю сессию.",
                )}
              </Text>
            </VStack>
            <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="sm" align="stretch">
              {LANDING_PLANS.map((plan) => (
                <Link key={plan.id} to="/pricing" className="block h-full w-full">
                  <SimpleCard
                    className={
                      plan.hero
                        ? "relative h-full border-2 border-primary bg-primary/10"
                        : "h-full border border-border transition-colors hover:bg-accent"
                    }
                  >
                    {plan.hero && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 whitespace-nowrap text-primary-foreground">
                        <Text variant="mini" bold>
                          {typo("Выгоднее всего")}
                        </Text>
                      </span>
                    )}
                    <VStack gap="3xs">
                      <Text variant="small" bold>
                        {plan.title}
                      </Text>
                      <Heading variant="h3" asParagraph>
                        {plan.price}
                      </Heading>
                      <Text variant="mini" color="supplementary">
                        {plan.days}
                      </Text>
                    </VStack>
                  </SimpleCard>
                </Link>
              ))}
            </AdaptiveGrid>
            <Button variant="outline" className="mx-auto" onClick={goPricing}>
              {typo("Подробнее о Pro")}
            </Button>
          </VStack>
        </VStack>
      </Container>

      <footer className="border-t border-border/60">
        <Container>
          <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="2xl" className="py-10">
            <VStack gap="sm">
              <Text bold>{typo("Мемокарты")}</Text>
              <Text variant="small" color="supplementary">
                {typo(
                  "Сервис подготовки к экзаменам: колоды карточек из ваших конспектов, интервальные повторения, тренажёры и чат по темам.",
                )}
              </Text>
            </VStack>

            <VStack gap="sm">
              <Heading variant="h4" asParagraph>
                {typo("Документы")}
              </Heading>
              <Link to="/offer" variant="underline">
                <Text variant="small">{typo("Публичная оферта")}</Text>
              </Link>
              <Link to="/privacy" variant="underline">
                <Text variant="small">{typo("Политика конфиденциальности")}</Text>
              </Link>
              <Link to="/pricing" variant="underline">
                <Text variant="small">{typo("Тарифы")}</Text>
              </Link>
            </VStack>

            <VStack gap="sm">
              <Heading variant="h4" asParagraph>
                {typo("Реквизиты продавца")}
              </Heading>
              <VStack gap="2xs">
                {SELLER_REQUISITES.map((item) => (
                  <Text key={item.label} variant="small" color="supplementary">
                    {`${item.label}: ${item.value}`}
                  </Text>
                ))}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  {SUPPORT_EMAIL}
                </a>
              </VStack>
            </VStack>
          </AdaptiveGrid>

          <div className="border-t border-border/60 py-5">
            <Text variant="mini" color="supplementary">
              {typo(`© ${new Date().getFullYear()} Мемокарты. Все права защищены.`)}
            </Text>
          </div>
        </Container>
      </footer>
    </div>
  );
}
