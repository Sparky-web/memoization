import { Button, Heading, HStack, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { type PricingPlanView } from "../model/planView";

interface PlanCardProps {
  plan: PricingPlanView;
  /** Идёт создание платежа (любого) — все кнопки блокируются. */
  pending: boolean;
  onSelect: () => void;
}

/** Карточка тарифа: герой («До сессии») выделен рамкой и бейджем. */
export function PlanCard({ plan, pending, onSelect }: PlanCardProps) {
  return (
    <SimpleCard
      className={
        plan.hero
          ? "relative h-full content-stretch border-2 border-primary bg-primary/10"
          : "relative h-full content-stretch border border-border"
      }
    >
      {plan.badge && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 whitespace-nowrap text-primary-foreground">
          <Text variant="mini" bold>
            {plan.badge}
          </Text>
        </span>
      )}
      <VStack gap="md" className="h-full">
        <VStack gap="3xs">
          <Heading variant="h3" asParagraph>
            {plan.title}
          </Heading>
          <Text variant="small" color="supplementary">
            {plan.tagline}
          </Text>
        </VStack>

        <VStack gap="3xs" className="flex-1">
          <HStack gap="xs" align="baseline">
            <Heading variant="h2" asParagraph>
              {plan.priceLabel}
            </Heading>
            <Text variant="small" color="supplementary">
              {typo("разовый платёж")}
            </Text>
          </HStack>
          <Text variant="small">{plan.daysLabel}</Text>
          {plan.note && (
            <Text variant="mini" color="supplementary">
              {plan.note}
            </Text>
          )}
        </VStack>

        <Button variant={plan.hero ? "default" : "outline"} size="pill" disabled={pending} onClick={onSelect}>
          {typo("Открыть Pro")}
        </Button>
      </VStack>
    </SimpleCard>
  );
}
