import { Button, Heading, SimpleCard, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { type PricingPlanView } from "../model/planView";

interface PlanCardProps {
  plan: PricingPlanView;
  /** Идёт создание платежа (любого) — все кнопки блокируются. */
  pending: boolean;
  onSelect: () => void;
}

/** Внутренность карточки тарифа: заголовок, цена-герой, срок, кнопка. */
function PlanCardBody({ plan, pending, onSelect }: PlanCardProps) {
  return (
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
        <div className="flex items-baseline gap-2">
          <p className="m-0 font-headings text-(length:--stat-value-font-size) leading-(--stat-value-line-height) font-extrabold tracking-tight tabular-nums">
            {plan.priceLabel}
          </p>
          <Text variant="small" color="supplementary">
            {typo("разовый платёж")}
          </Text>
        </div>
        <Text variant="small">{plan.daysLabel}</Text>
        {plan.note && (
          <Text variant="mini" color="supplementary">
            {plan.note}
          </Text>
        )}
      </VStack>

      <Button variant={plan.hero ? "brand" : "outline"} size="pill" disabled={pending} onClick={onSelect}>
        {typo("Открыть Pro")}
      </Button>
    </VStack>
  );
}

/** Карточка тарифа: герой («До сессии») — в градиентной рамке с бейджем, остальные — тихие. */
export function PlanCard(props: PlanCardProps) {
  if (!props.plan.hero) {
    return (
      <SimpleCard className="h-full content-stretch lift">
        <PlanCardBody {...props} />
      </SimpleCard>
    );
  }
  return (
    // Рамка 4px: на 2px градиент индиго→фиолет читался как сплошной primary-бордер.
    <div className="relative h-full rounded-3xl bg-brand-gradient p-1 shadow-card lift">
      {props.plan.badge && (
        <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-gradient px-3 py-1 whitespace-nowrap text-brand-foreground shadow-card">
          <Text variant="mini" bold>
            {props.plan.badge}
          </Text>
        </span>
      )}
      <SimpleCard className="h-full content-stretch shadow-none">
        <PlanCardBody {...props} />
      </SimpleCard>
    </div>
  );
}
