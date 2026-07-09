import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Clock, LoaderCircle, PartyPopper } from "lucide-react";
import { type PropsWithChildren, useState } from "react";

import { Button, Container, Heading, HStack, Text, useMountEffect, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";
import { getSession } from "~/server/fn/auth";
import { getBillingStatus } from "~/server/fn/billing";

export const Route = createFileRoute("/pricing/success/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/auth/signin" });
  },
  head: () => ({ meta: [{ title: typo("Оплата — Мемокарты") }] }),
  component: PaymentSuccessPage,
});

const POLL_INTERVAL_MS = 3000;
// Вебхук ЮKassa обычно приходит за секунды; после дедлайна честно говорим, что оплаты не видим
const POLL_DEADLINE_MS = 90_000;

function PaymentSuccessPage() {
  const navigate = useNavigate();
  // Дедлайн — отдельным таймером, а не производной от dataUpdatedAt: если последний запрос
  // перед дедлайном упал по сети, исход всё равно детерминирован (Pro или экран-заглушка),
  // а не вечный спиннер при уже выключенном поллинге.
  const [timedOut, setTimedOut] = useState(false);
  useMountEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, POLL_DEADLINE_MS);
    return () => {
      clearTimeout(timer);
    };
  });

  const { data: billing } = useQuery({
    queryKey: ["billing-status-poll"],
    queryFn: () => getBillingStatus(),
    refetchInterval: (query) => {
      if (query.state.data?.pro || timedOut) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const goApp = () => void navigate({ to: "/app" });
  const goPricing = () => void navigate({ to: "/pricing" });

  if (billing?.pro) {
    return (
      <Screen>
        <PartyPopper className="size-12 text-primary" />
        <Heading variant="h1" align="center">
          {typo("Pro активен!")}
        </Heading>
        <Text variant="large" color="supplementary" align="center">
          {billing.currentPeriodEnd
            ? typo(
                `Генерация колод, тренажёры и чат открыты до ${formatDateRuMsk(billing.currentPeriodEnd)}. Платёж разовый — ничего не спишется автоматически.`,
              )
            : typo("Генерация колод, тренажёры и чат открыты. Платёж разовый — ничего не спишется автоматически.")}
        </Text>
        <Button size="pill" onClick={goApp}>
          {typo("К колодам")}
        </Button>
      </Screen>
    );
  }

  // ЮKassa возвращает на этот URL и после отменённой/несостоявшейся оплаты — текст
  // после дедлайна нейтральный, с путём и «подождать», и «попробовать снова».
  if (timedOut) {
    return (
      <Screen>
        <Clock className="size-12 text-muted-foreground" />
        <Heading variant="h2" align="center">
          {typo("Мы пока не видим оплату")}
        </Heading>
        <Text color="supplementary" align="center">
          {typo(
            "Если вы оплатили — доступ откроется автоматически в течение пары минут. Если платёж был отменён или не прошёл — попробуйте оформить его ещё раз.",
          )}
        </Text>
        <HStack gap="sm" wrap justify="center">
          <Button size="pill" onClick={goPricing}>
            {typo("К тарифам")}
          </Button>
          <Button size="pill" variant="outline" onClick={goApp}>
            {typo("К колодам")}
          </Button>
        </HStack>
      </Screen>
    );
  }

  return (
    <Screen>
      <LoaderCircle className="size-12 animate-spin text-primary" />
      <Heading variant="h2" align="center">
        {typo("Проверяем оплату…")}
      </Heading>
      <Text color="supplementary" align="center">
        {typo("Обычно это занимает несколько секунд. Не закрывайте страницу.")}
      </Text>
    </Screen>
  );
}

function Screen({ children }: PropsWithChildren) {
  return (
    <Container className="flex min-h-dvh max-w-xl items-center justify-center py-10">
      <VStack gap="md" justify="center" className="text-center">
        {children}
      </VStack>
    </Container>
  );
}
