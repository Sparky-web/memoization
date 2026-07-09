import { useNavigate } from "@tanstack/react-router";
import { Dumbbell, MessageCircle, Sparkles } from "lucide-react";

import {
  BILLING_PLANS,
  FREE_CHAT_PER_DAY,
  FREE_DECK_GENERATIONS,
  type PaywallReason,
  PRO_CHAT_PER_DAY,
  PRO_DECK_GENERATIONS_PER_DAY,
  typo,
} from "~/lib";

import { Button } from "../ui/button";
import { Heading } from "./Heading";
import { SimpleCard } from "./SimpleCard";
import { Text } from "./Text";
import { useMountEffect } from "./useMountEffect";
import { VStack } from "./VStack";

interface PaywallContent {
  icon: typeof Sparkles;
  title: string;
  text: string;
}

const PAYWALL_CONTENT: Record<PaywallReason, PaywallContent> = {
  GENERATION: {
    icon: Sparkles,
    title: typo("Бесплатная генерация израсходована"),
    text: typo(
      `Бесплатно доступна ${FREE_DECK_GENERATIONS} ИИ-генерация колоды. В Pro — до ${PRO_DECK_GENERATIONS_PER_DAY} колод в день: загружайте конспекты по всем предметам. Колоды вручную и повторения остаются без ограничений.`,
    ),
  },
  EXERCISES: {
    icon: Dumbbell,
    title: typo("Генерация тренажёров — в Pro"),
    text: typo(
      "Бесплатная генерация заданий «вставь слово» и тестов израсходована. В Pro — генерируйте тренажёры для всех колод без ограничений.",
    ),
  },
  CHAT: {
    icon: MessageCircle,
    title: typo("Лимит чата на сегодня исчерпан"),
    text: typo(
      `Бесплатно доступно ${FREE_CHAT_PER_DAY} сообщений в день. В Pro — до ${PRO_CHAT_PER_DAY} сообщений: разбирайте сложные темы сколько нужно.`,
    ),
  },
};

interface PaywallCardProps {
  reason: PaywallReason;
  /** Компактный вариант для встраивания в страницу (меньше заголовок и отступы). */
  compact?: boolean;
  /** Аналитика paywall_shown: слой components не зовёт server functions — колбэк передаёт страница. */
  onShown?: () => void;
}

/** Карточка пейвола: объясняет причину блокировки и ведёт на страницу тарифов. */
export function PaywallCard({ reason, compact, onShown }: PaywallCardProps) {
  const navigate = useNavigate();
  useMountEffect(() => {
    onShown?.();
  });

  const content = PAYWALL_CONTENT[reason];
  const Icon = content.icon;

  return (
    <SimpleCard className="border border-primary/25 bg-primary/10" size={compact ? "md" : "lg"}>
      <VStack gap={compact ? "sm" : "md"}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
          <Icon className="size-6 text-primary" />
        </span>
        <VStack gap="2xs">
          <Heading variant={compact ? "h4" : "h3"} asParagraph>
            {content.title}
          </Heading>
          <Text variant={compact ? "small" : "normal"} color="supplementary">
            {content.text}
          </Text>
        </VStack>
        <VStack gap="2xs">
          <Button size={compact ? "default" : "pill"} onClick={() => void navigate({ to: "/pricing" })}>
            {typo("Открыть Pro")}
          </Button>
          <Text variant="mini" color="supplementary">
            {typo(`${BILLING_PLANS.TERM.rub} ₽ до сессии · разовый платёж, без автосписаний`)}
          </Text>
        </VStack>
      </VStack>
    </SimpleCard>
  );
}
