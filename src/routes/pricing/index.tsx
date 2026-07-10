import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, BookOpen, Mail, Undo2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AdaptiveGrid,
  Button,
  Container,
  Heading,
  HStack,
  Link,
  SimpleCard,
  Text,
  useMountEffect,
  VStack,
} from "~/components";
import { type BillingPlanId, formatDateRuMsk, typo } from "~/lib";
import { getSession } from "~/server/fn/auth";
import { createCheckout, getBillingStatus } from "~/server/fn/billing";
import { logEvent } from "~/server/fn/events";

import { PlanCard } from "./_lib/components/PlanCard";
import { PricingFaq } from "./_lib/components/PricingFaq";
import { buildPricingPlans } from "./_lib/model/planView";

export const Route = createFileRoute("/pricing/")({
  loader: async () => {
    // Страница публичная: гостю показываем витрину, залогиненному — ещё и статус подписки
    const session = await getSession();
    if (!session) return { authenticated: false, billing: null };
    return { authenticated: true, billing: await getBillingStatus() };
  },
  head: () => ({
    meta: [
      { title: typo("Тарифы Pro — Домашник") },
      {
        name: "description",
        content: typo(
          "Несколько экзаменов с одним планом, материалы с цитатами, голосовой «объясни ученику», умная зубрёжка и ИИ-сверка ответов. Разовый платёж без автосписаний — от 490 ₽.",
        ),
      },
    ],
  }),
  component: PricingPage,
});

interface TrustBullet {
  icon: typeof BadgeCheck;
  text: string;
}

const TRUST_BULLETS: readonly TrustBullet[] = [
  { icon: BadgeCheck, text: typo("Разовый платёж — карта не привязывается, автосписаний нет") },
  { icon: Zap, text: typo("Доступ открывается сразу после оплаты") },
  { icon: Mail, text: typo("Чек придёт на почту — оплата через ЮKassa") },
  { icon: Undo2, text: typo("Возврат за неиспользованные дни по оферте") },
];

function PricingPage() {
  const { authenticated, billing } = Route.useLoaderData();
  const navigate = useNavigate();
  const [pendingPlan, setPendingPlan] = useState<BillingPlanId | null>(null);

  useMountEffect(() => {
    if (authenticated) void logEvent({ data: { name: "pricing_viewed" } });
  });

  const selectPlan = async (planId: BillingPlanId) => {
    if (!authenticated) {
      await navigate({ to: "/auth/signup" });
      return;
    }
    setPendingPlan(planId);
    try {
      const { confirmationUrl } = await createCheckout({ data: { plan: planId } });
      window.location.assign(confirmationUrl);
    } catch (error) {
      setPendingPlan(null);
      const message =
        error instanceof Error && error.message
          ? error.message
          : typo("Не получилось создать платёж — попробуйте ещё раз");
      toast.error(message);
    }
  };

  const proActive = Boolean(billing?.pro);
  // currentPeriodEnd = null при активном Pro — безлимитная подписка, выданная админом.
  const proUntil = billing?.currentPeriodEnd ?? null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <Container className="max-w-5xl">
          <HStack align="center" justify="between" className="h-16">
            <Link to="/">
              <Text variant="large" bold>
                {typo("Домашник")}
              </Text>
            </Link>
            <Link to="/" variant="secondary">
              <HStack gap="xs" align="center">
                <ArrowLeft className="size-4" />
                {typo("На главную")}
              </HStack>
            </Link>
          </HStack>
        </Container>
      </header>

      <Container className="max-w-5xl">
        <VStack gap="2xl" className="py-10 lg:py-14">
          {/* Hero */}
          <VStack gap="sm" justify="center" className="text-center">
            <Heading variant="h1" align="center">
              {typo("Открой Pro на всю сессию")}
            </Heading>
            <Text variant="large" color="supplementary" align="center">
              {typo(
                "Pro открывает несколько экзаменов с одним планом, материалы с привязкой ответов, голосовой режим «объясни ученику», умную зубрёжку и ИИ-сверку ответов. Сессии, план к дате и честная готовность бесплатны для всех.",
              )}
            </Text>
          </VStack>

          {proActive ? (
            <SimpleCard className="border border-primary/25 bg-primary/10" size="lg">
              <VStack gap="sm" justify="center" className="text-center">
                <Heading variant="h3" asParagraph align="center">
                  {proUntil ? typo(`Pro активен до ${formatDateRuMsk(proUntil)}`) : typo("Pro активен бессрочно")}
                </Heading>
                <Text variant="small" color="supplementary" align="center">
                  {proUntil
                    ? typo(
                        "Платёж разовый — ничего не спишется автоматически. Когда срок закончится, новый период можно купить здесь.",
                      )
                    : typo("Доступ выдан без ограничения по сроку — покупать ничего не нужно.")}
                </Text>
                <Button size="pill" className="mx-auto" onClick={() => void navigate({ to: "/app" })}>
                  <BookOpen className="size-5" />
                  {typo("К экзаменам")}
                </Button>
              </VStack>
            </SimpleCard>
          ) : (
            <VStack gap="md">
              <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md" align="stretch" className="pt-2">
                {buildPricingPlans().map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    pending={pendingPlan !== null}
                    onSelect={() => void selectPlan(plan.id)}
                  />
                ))}
              </AdaptiveGrid>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Нажимая «Открыть Pro», вы соглашаетесь с ")}
                <Link to="/offer" variant="insideText">
                  {typo("офертой")}
                </Link>
                {typo(" и ")}
                <Link to="/privacy" variant="insideText">
                  {typo("политикой конфиденциальности")}
                </Link>
                {typo(".")}
              </Text>
            </VStack>
          )}

          {/* Буллеты доверия */}
          <AdaptiveGrid cols={{ base: 1, md: 2 }} gap="sm">
            {TRUST_BULLETS.map((bullet) => (
              <HStack key={bullet.text} gap="sm" align="center">
                <bullet.icon className="size-5 shrink-0 text-primary" />
                <Text variant="small">{bullet.text}</Text>
              </HStack>
            ))}
          </AdaptiveGrid>

          <PricingFaq />

          <Text variant="mini" color="supplementary" align="center">
            <Link to="/offer" variant="insideText">
              {typo("Публичная оферта")}
            </Link>
            {" · "}
            <Link to="/privacy" variant="insideText">
              {typo("Политика конфиденциальности")}
            </Link>
          </Text>
        </VStack>
      </Container>
    </div>
  );
}
