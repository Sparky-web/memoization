import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, BookOpen, Mail, Undo2, Zap } from "lucide-react";
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

import { SiteHeader } from "../_lib";
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
      <SiteHeader containerClassName="max-w-5xl">
        {authenticated ? (
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app" })}>
            {typo("К экзаменам")}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/auth/signin" })}>
            {typo("Войти")}
          </Button>
        )}
      </SiteHeader>

      <Container className="relative max-w-5xl">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 overflow-hidden">
          <div className="absolute top-4 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
        </div>
        <VStack gap="5xl" className="py-10 md:py-16">
          {/* Hero */}
          <VStack gap="sm" justify="center" className="rise text-center">
            <Heading variant="h1" align="center">
              {typo("Открой ")}
              <span className="text-brand-gradient">Pro</span>
              {typo(" на всю сессию")}
            </Heading>
            <div className="mx-auto max-w-3xl">
              <Text variant="large" color="supplementary" align="center">
                {typo(
                  "Pro открывает несколько экзаменов с одним планом, материалы с привязкой ответов, голосовой режим «объясни ученику», умную зубрёжку и ИИ-сверку ответов. Сессии, план к дате и честная готовность бесплатны для всех.",
                )}
              </Text>
            </div>
          </VStack>

          {proActive ? (
            <SimpleCard className="rise bg-accent/60" size="lg">
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
                <Button variant="brand" size="pill" className="mx-auto" onClick={() => void navigate({ to: "/app" })}>
                  <BookOpen className="size-5" strokeWidth={1.8} />
                  {typo("К экзаменам")}
                </Button>
              </VStack>
            </SimpleCard>
          ) : (
            <VStack gap="md">
              <AdaptiveGrid cols={{ base: 1, md: 3 }} gap="md" align="stretch" className="rise pt-3 md:pt-2">
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
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <bullet.icon className="size-5" strokeWidth={1.8} />
                </span>
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
