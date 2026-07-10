import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Heading, HStack, PaywallCard, SimpleCard, Text, useTheme, VStack } from "~/components";
import { isPaywallError, typo } from "~/lib";
import { logEvent } from "~/server/fn/events";
import { updateUserSettings } from "~/server/fn/settings";

import { Chip, examQueries, pluralRu } from "../exams/_lib";
import { disablePushNotifications, enablePushNotifications, pushQueries } from "./_lib/model/pushModel";

// Настройки пользователя: дневной бюджет, дни отдыха, предсонное напоминание, уведомления,
// тема, ИИ-сверка открытых ответов (Pro). Каждое изменение сохраняется сразу — без «Сохранить».

export const Route = createFileRoute("/app/settings/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(examQueries.settings()),
      context.queryClient.ensureQueryData(examQueries.billing()),
      context.queryClient.ensureQueryData(pushQueries.status()),
    ]),
  head: () => ({ meta: [{ title: typo("Настройки") }] }),
  component: SettingsPage,
});

// Человеческие тексты кодов ошибок включения push-напоминаний.
const PUSH_ERROR_TEXTS: Record<string, string> = {
  UNSUPPORTED: typo("Браузер не поддерживает push-уведомления"),
  PERMISSION_DENIED: typo("Уведомления запрещены в браузере — разрешите их для этого сайта и попробуйте снова"),
  SUBSCRIBE_FAILED: typo("Не удалось оформить подписку — попробуйте ещё раз"),
};

// Секция «Уведомления»: включение/отключение push-напоминаний. Виды напоминаний описаны
// текстом — отдельные тумблеры не плодим.
function NotificationsCard() {
  const queryClient = useQueryClient();
  const { data: push } = useSuspenseQuery(pushQueries.status());

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["push"] });

  const enable = useMutation({
    mutationFn: async () => {
      if (!push.publicKey) throw new Error("UNSUPPORTED");
      await enablePushNotifications(push.publicKey);
    },
    onSuccess: () => {
      toast.success(typo("Напоминания включены"));
      refresh();
    },
    onError: (error) => {
      const known = PUSH_ERROR_TEXTS[error.message];
      if (!known) console.error(error);
      toast.error(known ?? typo("Не удалось включить напоминания"));
    },
  });

  const disable = useMutation({
    mutationFn: () => disablePushNotifications(),
    onSuccess: (removed) => {
      if (removed) {
        toast.success(typo("Напоминания на этом устройстве отключены"));
      } else {
        toast.info(typo("На этом устройстве подписки нет — отключите на том, где включали"));
      }
      refresh();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось отключить напоминания"));
    },
  });

  if (!push.configured) {
    return (
      <SimpleCard title={typo("Уведомления")}>
        <Text variant="small" color="supplementary">
          {typo("Push-напоминания о плане дня скоро появятся — мы уже готовим их.")}
        </Text>
      </SimpleCard>
    );
  }

  return (
    <SimpleCard title={typo("Уведомления")}>
      <Text variant="small" color="supplementary">
        {typo(
          "Напомним о плане дня (после 16:00), лёгком повторении перед сном и накануне экзамена — не больше пары напоминаний в день.",
        )}
      </Text>
      {push.subscribed ? (
        <HStack gap="sm" align="center" wrap>
          <Badge variant="dot" dot="success">
            {typo("включены")}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={disable.isPending}
            onClick={() => {
              disable.mutate();
            }}
          >
            {typo("Отключить")}
          </Button>
        </HStack>
      ) : (
        <HStack>
          <Button
            variant="outline"
            disabled={enable.isPending}
            onClick={() => {
              enable.mutate();
            }}
          >
            <BellRing className="size-4" strokeWidth={1.8} />
            {enable.isPending ? typo("Включаем…") : typo("Включить напоминания")}
          </Button>
        </HStack>
      )}
      <Text variant="mini" color="supplementary">
        {typo("На iPhone — добавь приложение на экран «Домой»: уведомления работают в установленном приложении.")}
      </Text>
    </SimpleCard>
  );
}

const MINUTES_OPTIONS: readonly number[] = [10, 15, 25, 40, 60];

// Порядок недели — русский (с понедельника); значения — конвенция JS getDay (0 — воскресенье).
const WEEKDAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: typo("Пн") },
  { value: 2, label: typo("Вт") },
  { value: 3, label: typo("Ср") },
  { value: 4, label: typo("Чт") },
  { value: 5, label: typo("Пт") },
  { value: 6, label: typo("Сб") },
  { value: 0, label: typo("Вс") },
];

const BEDTIME_OPTIONS: readonly { value: number | null; label: string }[] = [
  { value: null, label: typo("выключено") },
  { value: 20, label: "20:00" },
  { value: 21, label: "21:00" },
  { value: 22, label: "22:00" },
  { value: 23, label: "23:00" },
];

interface SettingsPatch {
  dailyMinutesTotal?: number;
  restWeekdays?: number[];
  bedtimeHour?: number | null;
  aiCheckEnabled?: boolean;
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(examQueries.settings());
  const { data: billing } = useSuspenseQuery(examQueries.billing());
  const { isDark, setDark } = useTheme();
  const [showAiPaywall, setShowAiPaywall] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
  };

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => updateUserSettings({ data: patch }),
    onSuccess: refresh,
    onError: (error) => {
      if (isPaywallError(error, "AI_CHECK")) {
        setShowAiPaywall(true);
        return;
      }
      console.error(error);
      toast.error(typo("Не удалось сохранить настройки"));
      refresh();
    },
  });

  const toggleRestWeekday = (weekday: number) => {
    const next = settings.restWeekdays.includes(weekday)
      ? settings.restWeekdays.filter((day) => day !== weekday)
      : [...settings.restWeekdays, weekday];
    save.mutate({ restWeekdays: next });
  };

  const requestAiCheck = (enabled: boolean) => {
    if (enabled && !billing.pro) {
      setShowAiPaywall(true);
      void logEvent({ data: { name: "paywall_shown", meta: { reason: "AI_CHECK", place: "settings" } } }).catch(
        () => undefined,
      );
      return;
    }
    save.mutate({ aiCheckEnabled: enabled });
  };

  return (
    <VStack gap="xl" className="mx-auto w-full max-w-2xl">
      <Heading variant="h1">{typo("Настройки")}</Heading>

      <SimpleCard title={typo("Минут занятий в день")}>
        <Text variant="small" color="supplementary">
          {typo("Общий дневной бюджет на все экзамены — план дня делит его между ними по срочности.")}
        </Text>
        <HStack gap="2xs" wrap>
          {MINUTES_OPTIONS.map((minutes) => (
            <Chip
              key={minutes}
              active={settings.dailyMinutesTotal === minutes}
              disabled={save.isPending}
              onClick={() => {
                save.mutate({ dailyMinutesTotal: minutes });
              }}
            >
              {typo(`${minutes} минут`)}
            </Chip>
          ))}
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Дни отдыха")}>
        <Text variant="small" color="supplementary">
          {typo(
            `Запланированный отдых не рвёт серию. Внеплановый пропуск закрывает заморозка — их 2 на месяц, остаток: ${settings.freezesLeft} ${pluralRu(settings.freezesLeft, "штука", "штуки", "штук")}`,
          )}
        </Text>
        <HStack gap="2xs" wrap>
          {WEEKDAY_OPTIONS.map((weekday) => (
            <Chip
              key={weekday.value}
              active={settings.restWeekdays.includes(weekday.value)}
              disabled={save.isPending}
              onClick={() => {
                toggleRestWeekday(weekday.value);
              }}
            >
              {weekday.label}
            </Chip>
          ))}
        </HStack>
      </SimpleCard>

      <SimpleCard title={typo("Повторение перед сном")}>
        <Text variant="small" color="supplementary">
          {typo("С этого часа «Сегодня» предложит лёгкий прогон пройденного за день — сон закрепит материал.")}
        </Text>
        <HStack gap="2xs" wrap>
          {BEDTIME_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              active={settings.bedtimeHour === option.value}
              disabled={save.isPending}
              onClick={() => {
                save.mutate({ bedtimeHour: option.value });
              }}
            >
              {option.label}
            </Chip>
          ))}
        </HStack>
      </SimpleCard>

      <NotificationsCard />

      <SimpleCard title={typo("Тема")}>
        <HStack gap="2xs">
          <Chip
            active={!isDark}
            onClick={() => {
              setDark(false);
            }}
          >
            <Sun className="size-4" strokeWidth={1.8} />
            {typo("Светлая")}
          </Chip>
          <Chip
            active={isDark}
            onClick={() => {
              setDark(true);
            }}
          >
            <Moon className="size-4" strokeWidth={1.8} />
            {typo("Тёмная")}
          </Chip>
        </HStack>
      </SimpleCard>

      <SimpleCard
        title={
          <HStack gap="xs" align="center">
            {typo("ИИ-сверка открытых ответов")}
            <Badge variant="primary">Pro</Badge>
          </HStack>
        }
      >
        <Text variant="small" color="supplementary">
          {typo(
            "Нейросеть сверяет твой открытый ответ с эталоном по смыслу и сразу говорит, что упущено. Без неё ты оцениваешь ответ сам.",
          )}
        </Text>
        <HStack gap="2xs" wrap>
          <Chip
            active={!settings.aiCheckEnabled}
            disabled={save.isPending}
            onClick={() => {
              requestAiCheck(false);
            }}
          >
            {typo("Выключена")}
          </Chip>
          <Chip
            active={settings.aiCheckEnabled}
            disabled={save.isPending}
            onClick={() => {
              requestAiCheck(true);
            }}
          >
            {typo("Включена")}
          </Chip>
        </HStack>
        {showAiPaywall && !billing.pro && <PaywallCard reason="AI_CHECK" compact />}
      </SimpleCard>
    </VStack>
  );
}
