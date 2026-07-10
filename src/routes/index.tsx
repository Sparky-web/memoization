import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { AdaptiveGrid, Button, Container, Heading, HStack, Link, SimpleCard, Text, VStack } from "~/components";
import { BILLING_PLAN_IDS, BILLING_PLANS, type BillingPlanId, typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

import { LandingDailyLoop } from "./_lib/components/LandingDailyLoop";
import { LandingDemo } from "./_lib/components/LandingDemo";
import { LandingFaq } from "./_lib/components/LandingFaq";
import { LandingFeatures } from "./_lib/components/LandingFeatures";
import { LandingGroupCta } from "./_lib/components/LandingGroupCta";
import { LandingScience } from "./_lib/components/LandingScience";
import { SELLER_REQUISITES, SITE_URL, SUPPORT_EMAIL } from "./_lib/lib/marketing";

const PAGE_TITLE = typo("Домашник — вставь вопросы к экзамену и дойди до сдачи");
const PAGE_DESCRIPTION = typo(
  "ИИ отвечает на вопросы по твоим конспектам, дробит их на карточки, а план повторений доводит до экзамена точно к дате. 1 экзамен и генерация — бесплатно, без карты.",
);

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // Авторизованного пользователя сразу ведём в приложение.
    const session = await getSession();
    if (session) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: typo("Домашник") },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],
  }),
  component: HomePage,
});

interface LandingPlan {
  id: BillingPlanId;
  title: string;
  price: string;
  days: string;
  note: string;
  hero: boolean;
}

/** Кому какой срок: короткая подпись под ценой на витрине. */
const PLAN_NOTES: Record<BillingPlanId, string> = {
  MONTH: typo("если экзамен уже на носу"),
  TERM: typo("вся сессия — с запасом на пересдачи"),
  YEAR: typo("обе сессии и госы"),
};

// Компактная витрина тарифов для лендинга: детали и покупка — на /pricing
const LANDING_PLANS: readonly LandingPlan[] = BILLING_PLAN_IDS.map((planId) => ({
  id: planId,
  title: BILLING_PLANS[planId].title,
  price: typo(`${BILLING_PLANS[planId].rub} ₽`),
  days: typo(`${BILLING_PLANS[planId].days} дней`),
  note: PLAN_NOTES[planId],
  hero: planId === "TERM",
}));

function HomePage() {
  const navigate = useNavigate();
  const goSignup = () => void navigate({ to: "/auth/signup" });
  const goSignin = () => void navigate({ to: "/auth/signin" });
  const goPricing = () => void navigate({ to: "/pricing" });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60">
        <Container className="py-3">
          <HStack justify="between" align="center" gap="md">
            <Text bold>{typo("Домашник")}</Text>
            <HStack gap="md" align="center">
              <Link to="/pricing" variant="secondary">
                {typo("Тарифы")}
              </Link>
              <Button variant="outline" size="sm" onClick={goSignin}>
                {typo("Войти")}
              </Button>
            </HStack>
          </HStack>
        </Container>
      </header>

      <main>
        <Container className="page-enter py-12 md:py-16">
          <VStack gap="5xl">
            {/* 1. Hero */}
            <section>
              <VStack gap="lg" justify="center">
                <VStack gap="md" justify="center">
                  <div className="max-w-3xl">
                    <Heading variant="h1" align="center">
                      {typo("Вставь вопросы к экзамену — Домашник доведёт до сдачи")}
                    </Heading>
                  </div>
                  <div className="max-w-2xl">
                    <Text variant="large" color="supplementary" align="center">
                      {typo(
                        "ИИ ответит на каждый вопрос по твоим конспектам, разобьёт ответы на карточки и составит план повторений точно к дате экзамена.",
                      )}
                    </Text>
                  </div>
                </VStack>
                <VStack gap="xs" justify="center">
                  <HStack gap="sm" justify="center" wrap>
                    <Button size="pill" onClick={goSignup}>
                      {typo("Начать бесплатно")}
                    </Button>
                    <Button variant="outline" size="pill" onClick={goSignin}>
                      {typo("Войти")}
                    </Button>
                  </HStack>
                  <Text variant="mini" color="supplementary" align="center">
                    {typo("1 экзамен и генерация — бесплатно, без карты")}
                  </Text>
                </VStack>
              </VStack>
            </section>

            {/* 2. Демка «вопросы → ответы с цитатой → карточки → план к дате» */}
            <LandingDemo />

            {/* 3. Ежедневный цикл: план → сессия → честная готовность */}
            <LandingDailyLoop />

            {/* 4. Наука кратко */}
            <LandingScience />

            {/* 5. Фичи поверх ядра */}
            <LandingFeatures />

            {/* 6. Для группы */}
            <LandingGroupCta />

            {/* 7. Тарифы */}
            <section>
              <VStack gap="lg">
                <VStack gap="xs">
                  <Heading variant="h2" align="center">
                    {typo("Бесплатно — до экзамена. Pro — на сессию")}
                  </Heading>
                  <div className="mx-auto max-w-2xl">
                    <Text color="supplementary" align="center">
                      {typo(
                        "Один экзамен с сессиями, планом к дате и честной готовностью — бесплатно. Pro добавляет несколько экзаменов с одним планом, материалы с цитатами, голосового ученика и умную зубрёжку. Разовый платёж без автосписаний — карта не привязывается.",
                      )}
                    </Text>
                  </div>
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
                          <Text variant="mini" color="supplementary">
                            {plan.note}
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
            </section>

            {/* 8. FAQ */}
            <LandingFaq />

            {/* 9. Финальный CTA */}
            <section>
              <VStack gap="md" justify="center">
                <Heading variant="h2" align="center">
                  {typo("Ближайший экзамен — хороший повод попробовать")}
                </Heading>
                <div className="max-w-xl">
                  <Text color="supplementary" align="center">
                    {typo(
                      "Вставь список вопросов и дату — через несколько минут будут ответы, карточки и план до дня «Х». Бесплатно, карта не нужна.",
                    )}
                  </Text>
                </div>
                <Button size="pill" onClick={goSignup}>
                  {typo("Начать бесплатно")}
                </Button>
              </VStack>
            </section>
          </VStack>
        </Container>
      </main>

      <footer className="border-t border-border/60">
        <Container>
          <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="2xl" className="py-10">
            <VStack gap="sm">
              <Text bold>{typo("Домашник")}</Text>
              <Text variant="small" color="supplementary">
                {typo(
                  "Сервис подготовки к экзаменам: ИИ-ответы по вашим конспектам, карточки, план повторений к дате и честная готовность.",
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
              {typo(`© ${new Date().getFullYear()} Домашник. Все права защищены.`)}
            </Text>
          </div>
        </Container>
      </footer>
    </div>
  );
}
