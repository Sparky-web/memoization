import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Clock, LoaderCircle, PartyPopper } from "lucide-react";
import { type PropsWithChildren, useState } from "react";

import { Button, Container, Heading, Text, VStack } from "~/components";
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
// Вебхук ЮKassa обычно приходит за секунды; после дедлайна честно говорим «обрабатывается»
const POLL_DEADLINE_MS = 90_000;

function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [startedAt] = useState(() => Date.now());

  const { data: billing, dataUpdatedAt } = useQuery({
    queryKey: ["billing-status-poll"],
    queryFn: () => getBillingStatus(),
    refetchInterval: (query) => {
      if (query.state.data?.pro) return false;
      if (Date.now() - startedAt >= POLL_DEADLINE_MS) return false;
      return POLL_INTERVAL_MS;
    },
  });

  const goApp = () => void navigate({ to: "/app" });

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

  const timedOut = Boolean(billing) && dataUpdatedAt - startedAt >= POLL_DEADLINE_MS;
  if (timedOut) {
    return (
      <Screen>
        <Clock className="size-12 text-muted-foreground" />
        <Heading variant="h2" align="center">
          {typo("Платёж обрабатывается")}
        </Heading>
        <Text color="supplementary" align="center">
          {typo("Доступ откроется автоматически в течение пары минут — можно уже вернуться к колодам.")}
        </Text>
        <Button size="pill" onClick={goApp}>
          {typo("К колодам")}
        </Button>
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
