import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { GraduationCap, Sparkles } from "lucide-react";

import { AdaptiveGrid, Badge, Button, Container, Heading, HStack, Link, SimpleCard, Text, VStack } from "~/components";
import { BILLING_PLAN_IDS, BILLING_PLANS, type BillingPlanId, typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

import { LandingDailyLoop } from "./_lib/components/LandingDailyLoop";
import { LandingDemo } from "./_lib/components/LandingDemo";
import { LandingFaq } from "./_lib/components/LandingFaq";
import { LandingFeatures } from "./_lib/components/LandingFeatures";
import { LandingGroupCta } from "./_lib/components/LandingGroupCta";
import { LandingScience } from "./_lib/components/LandingScience";
import { SiteHeader } from "./_lib/components/SiteHeader";
import { SELLER_REQUISITES, SITE_URL, SUPPORT_EMAIL } from "./_lib/lib/marketing";
import { riseDelay } from "./_lib/lib/motion";

const PAGE_TITLE = typo("Домашник — вставь вопросы к экзамену и дойди до сдачи");
const PAGE_DESCRIPTION = typo(
  "ИИ отвечает на каждый вопрос к экзамену, дробит ответы на карточки, а план повторений доводит до даты. С Pro ответы строятся по твоим конспектам с цитатой источника. 1 экзамен и генерация — бесплатно, без карты.",
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

/** Внутренность карточки тарифа на витрине: цена — цифра-герой, подписи тихие. */
function LandingPlanBody({ plan }: { plan: LandingPlan }) {
  return (
    <VStack gap="3xs">
      <Text variant="small" bold>
        {plan.title}
      </Text>
      <p className="m-0 font-headings text-(length:--stat-value-font-size) leading-(--stat-value-line-height) font-extrabold tracking-tight tabular-nums">
        {plan.price}
      </p>
      <Text variant="mini" color="supplementary">
        {plan.days}
      </Text>
      <Text variant="mini" color="supplementary">
        {plan.note}
      </Text>
    </VStack>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const goSignup = () => void navigate({ to: "/auth/signup" });
  const goSignin = () => void navigate({ to: "/auth/signin" });
  const goPricing = () => void navigate({ to: "/pricing" });

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <HStack gap="sm" align="center">
          <Link to="/pricing" variant="secondary" className="hidden sm:block">
            {typo("Тарифы")}
          </Link>
          <Button variant="outline" size="sm" onClick={goSignin}>
            {typo("Войти")}
          </Button>
          <Button size="sm" className="hidden md:inline-flex" onClick={goSignup}>
            {typo("Начать бесплатно")}
          </Button>
        </HStack>
      </SiteHeader>

      <main>
        {/* 1. Hero: градиентное слово-акцент + мягкие брендовые пятна на фоне */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-6 left-1/4 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-15 blur-3xl" />
            <div className="absolute top-32 right-1/4 size-64 translate-x-1/3 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
          </div>
          <Container className="pt-14 pb-10 md:pt-24 md:pb-16">
            <VStack gap="xl" justify="center">
              <VStack gap="md" justify="center">
                <div className="rise" style={riseDelay(0)}>
                  <Badge variant="outline" className="gap-1.5 border-primary/25 bg-card/60 px-3 py-1 text-primary">
                    <Sparkles className="size-3.5" strokeWidth={1.8} />
                    {typo("ИИ-подготовка к экзаменам")}
                  </Badge>
                </div>
                <div className="rise max-w-3xl" style={riseDelay(1)}>
                  <Heading variant="h1" align="center">
                    {typo("Вставь вопросы к экзамену — ")}
                    <span className="text-brand-gradient">{typo("Домашник доведёт до сдачи")}</span>
                  </Heading>
                </div>
                <div className="rise max-w-2xl" style={riseDelay(2)}>
                  <Text variant="large" color="supplementary" align="center">
                    {typo(
                      "ИИ ответит на каждый вопрос, разобьёт ответы на карточки и составит план повторений точно к дате экзамена. С Pro ответы строятся по твоим конспектам — с цитатой источника.",
                    )}
                  </Text>
                </div>
              </VStack>
              <VStack gap="sm" justify="center" className="rise" style={riseDelay(3)}>
                <HStack gap="sm" justify="center" wrap>
                  <Button variant="brand" size="pill" onClick={goSignup}>
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
          </Container>
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

        {/* 7. Тарифы: компактная витрина, герой TERM — в градиентной рамке */}
        <section>
          <Container className="py-10 md:py-16">
            <VStack gap="xl">
              <VStack gap="sm">
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
              <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md" align="stretch" className="pt-3 md:pt-2">
                {LANDING_PLANS.map((plan, planIndex) => (
                  <Link key={plan.id} to="/pricing" className="rise block h-full w-full" style={riseDelay(planIndex)}>
                    {plan.hero ? (
                      <div className="lift press relative h-full rounded-3xl bg-brand-gradient p-0.5 shadow-card">
                        <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 whitespace-nowrap text-brand-foreground shadow-card">
                          <Text variant="mini" bold>
                            {typo("Выгоднее всего")}
                          </Text>
                        </span>
                        <SimpleCard className="h-full shadow-none">
                          <LandingPlanBody plan={plan} />
                        </SimpleCard>
                      </div>
                    ) : (
                      <SimpleCard interactive className="h-full">
                        <LandingPlanBody plan={plan} />
                      </SimpleCard>
                    )}
                  </Link>
                ))}
              </AdaptiveGrid>
              <Button variant="outline" className="mx-auto" onClick={goPricing}>
                {typo("Подробнее о Pro")}
              </Button>
            </VStack>
          </Container>
        </section>

        {/* 8. FAQ */}
        <LandingFaq />

        {/* 9. Финальный CTA */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute bottom-0 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
          </div>
          <Container className="py-14 md:py-24">
            <VStack gap="lg" justify="center">
              <VStack gap="sm" justify="center">
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
              </VStack>
              <Button variant="brand" size="pill" onClick={goSignup}>
                {typo("Начать бесплатно")}
              </Button>
            </VStack>
          </Container>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-card/40">
        <Container>
          <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="2xl" className="py-12">
            <VStack gap="sm">
              <HStack gap="xs" align="center">
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient text-brand-foreground">
                  <GraduationCap className="size-4" strokeWidth={1.8} />
                </span>
                <Text bold>{typo("Домашник")}</Text>
              </HStack>
              <Text variant="small" color="supplementary">
                {typo(
                  "Сервис подготовки к экзаменам: ИИ-ответы на вопросы (в Pro — по вашим конспектам), карточки, план повторений к дате и честная готовность.",
                )}
              </Text>
            </VStack>

            <VStack gap="sm">
              <Heading variant="h4" asParagraph>
                {typo("Документы")}
              </Heading>
              <VStack gap="xs">
                <Link to="/offer" variant="secondary">
                  <Text variant="small">{typo("Публичная оферта")}</Text>
                </Link>
                <Link to="/privacy" variant="secondary">
                  <Text variant="small">{typo("Политика конфиденциальности")}</Text>
                </Link>
                <Link to="/pricing" variant="secondary">
                  <Text variant="small">{typo("Тарифы")}</Text>
                </Link>
              </VStack>
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
                  className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
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
