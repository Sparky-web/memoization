import { useNavigate } from "@tanstack/react-router";
import { CheckCheck, FileText, Layers, MessageCircle, Mic, Sparkles, Waypoints, Zap } from "lucide-react";

import {
  BILLING_PLANS,
  FREE_CHAT_PER_DAY,
  FREE_DECK_GENERATIONS,
  FREE_QUESTIONS_PER_EXAM,
  type PaywallReason,
  PRO_CHAT_PER_DAY,
  PRO_DECK_GENERATIONS_PER_DAY,
  PRO_EXAMS,
  PRO_QUESTIONS_PER_EXAM,
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
      `Бесплатно доступна ${FREE_DECK_GENERATIONS} ИИ-генерация экзамена. В Pro — до ${PRO_DECK_GENERATIONS_PER_DAY} генераций в день: загружайте вопросы и конспекты по всем предметам.`,
    ),
  },
  CHAT: {
    icon: MessageCircle,
    title: typo("Лимит сообщений на сегодня исчерпан"),
    text: typo(
      `Бесплатно доступно ${FREE_CHAT_PER_DAY} сообщений в день. В Pro — до ${PRO_CHAT_PER_DAY}: разбирайте сложные темы и объясняйте ученику сколько нужно.`,
    ),
  },
  MULTI_EXAM: {
    icon: Layers,
    title: typo("Несколько экзаменов — в Pro"),
    text: typo(
      `Бесплатно можно готовиться к одному экзамену (до ${FREE_QUESTIONS_PER_EXAM} вопросов). В Pro — до ${PRO_EXAMS} экзаменов с общим планом дня и до ${PRO_QUESTIONS_PER_EXAM} вопросов на каждый.`,
    ),
  },
  MATERIALS: {
    icon: FileText,
    title: typo("Свои материалы — в Pro"),
    text: typo(
      "В Pro ответы строятся по вашим конспектам и методичкам с цитатой источника у каждой карточки — до 5 файлов по 10 МБ на экзамен.",
    ),
  },
  VOICE: {
    icon: Mic,
    title: typo("Голосовой ученик — в Pro"),
    text: typo(
      "Объясняйте тему голосом, как на настоящем экзамене: ученик переспрашивает, а в конце покажет, что осталось непонятным.",
    ),
  },
  AI_CHECK: {
    icon: CheckCheck,
    title: typo("ИИ-сверка ответов — в Pro"),
    text: typo(
      "Бесплатно вы оцениваете свой ответ сами. В Pro нейросеть сверяет ответ с эталоном по смыслу и сразу говорит, что упущено.",
    ),
  },
  CRAM: {
    icon: Zap,
    title: typo("Умная зубрёжка — в Pro"),
    text: typo(
      "Экзамен уже завтра? Режим спринтов по самым слабым карточкам с повтором ошибок и защитой сна — максимум пользы за оставшиеся часы.",
    ),
  },
  MAPS: {
    icon: Waypoints,
    title: typo("Больше карт связей — в Pro"),
    text: typo(
      "Бесплатно можно вести одну карту связей. В Pro — отдельная карта на каждую тему и экзамен: стройте схемы по всем предметам.",
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
