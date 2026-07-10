import { createFileRoute } from "@tanstack/react-router";

import {
  AdaptiveGrid,
  Badge,
  Heading,
  HStack,
  Link,
  ProgressBar,
  ReadinessRing,
  SimpleCard,
  Stat,
  Text,
  VStack,
} from "~/components";
import { formatDateRuMsk, typo } from "~/lib";
import { getOverallStats } from "~/server/fn/stats";

import { cardFormatLabel, cardsCountLabel, daysToExamLabel, pluralRu } from "../exams/_lib";

// Статистика: готовность (кольца + слабые темы), активность (календарь, серия),
// калибровка (прогноз-vs-факт, уверенность-vs-результат — ядро честности, бесплатно), форматы.

export const Route = createFileRoute("/app/stats/")({
  loader: () => getOverallStats(),
  head: () => ({ meta: [{ title: typo("Статистика") }] }),
  component: StatsPage,
});

type OverallStats = Awaited<ReturnType<typeof getOverallStats>>;

function percentLabel(correct: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

// Вывод калибровки прогнозов: средняя разница «прогноз − факт» в процентных пунктах.
function forecastSummaryOf(averageDelta: number): string {
  const rounded = Math.round(Math.abs(averageDelta));
  if (averageDelta >= 3)
    return typo(`В среднем ты переоцениваешь себя на ${rounded} п.п. — доверяй фактам, а не ощущению «знаю».`);
  if (averageDelta <= -3)
    return typo(`В среднем ты недооцениваешь себя на ${rounded} п.п. — знаешь больше, чем кажется.`);
  return typo("В среднем твои прогнозы точны: расхождение с фактом меньше 3 п.п.");
}

// Календарь-бары активности за 30 дней; высота — от максимума за период.
function ActivityBars({ activity }: { activity: OverallStats["activity"] }) {
  const maxCount = Math.max(...activity.map((day) => day.count), 1);
  // Success с прозрачностью: месяц «зелёных кирпичей» не превращается в сплошную стену цвета.
  const barClassOf = (day: OverallStats["activity"][number]): string => {
    if (day.counted) return "bg-success/75";
    if (day.count) return "bg-primary/60";
    return "bg-muted";
  };
  const firstDay = activity[0];
  const lastDay = activity[activity.length - 1];

  return (
    <VStack gap="2xs">
      <HStack gap="3xs" align="end" className="h-20">
        {activity.map((day) => (
          <div
            key={day.date}
            title={typo(`${day.date}: ${day.count} ${pluralRu(day.count, "ответ", "ответа", "ответов")}`)}
            className={`min-h-1 flex-1 rounded-sm ${barClassOf(day)}`}
            style={{ height: `${Math.max((day.count / maxCount) * 100, 4)}%` }}
          />
        ))}
      </HStack>
      <HStack justify="between">
        <Text variant="mini" color="supplementary">
          {firstDay ? formatDateRuMsk(new Date(`${firstDay.date}T12:00:00+03:00`)) : ""}
        </Text>
        <Text variant="mini" color="supplementary">
          {lastDay ? formatDateRuMsk(new Date(`${lastDay.date}T12:00:00+03:00`)) : ""}
        </Text>
      </HStack>
      {/* Легенда — тихие статусы «точка + текст» вместо абзаца-пояснения. */}
      <HStack gap="sm" wrap>
        <Badge variant="dot" dot="success">
          {typo("день засчитан в серию")}
        </Badge>
        <Badge variant="dot" dot="primary">
          {typo("занимался")}
        </Badge>
        <Badge variant="dot" dot="muted">
          {typo("пропуск")}
        </Badge>
      </HStack>
    </VStack>
  );
}

function ReadinessSection({ stats }: { stats: OverallStats }) {
  const activeExams = stats.exams.filter((exam) => !exam.archived);
  if (!activeExams.length) {
    return (
      <SimpleCard title={typo("Готовность")}>
        <Text variant="small" color="supplementary">
          {typo(
            "Пока нет активных экзаменов. Создай экзамен — и здесь появится честная готовность по реальному припоминанию.",
          )}
        </Text>
      </SimpleCard>
    );
  }
  return (
    <SimpleCard title={typo("Готовность")} size="lg">
      <AdaptiveGrid cols={{ base: 1, md: 2 }} gap="sm">
        {activeExams.map((exam) => (
          <HStack key={exam.examId} gap="md" align="center" className="rounded-2xl bg-background/50 p-3">
            <ReadinessRing value={exam.readiness} size="sm" />
            <VStack gap="3xs">
              <Link to={`/app/exams/${exam.examId}`} className="font-semibold">
                {typo(exam.title)}
              </Link>
              <Text variant="mini" color="supplementary">
                {daysToExamLabel(exam.daysToExam) ?? typo("поддерживающее повторение")}
              </Text>
            </VStack>
          </HStack>
        ))}
      </AdaptiveGrid>
      {stats.weakTopics.length > 0 && (
        <VStack gap="2xs">
          <Text variant="small" bold>
            {typo("Слабые темы")}
          </Text>
          {stats.weakTopics.map((topic) => (
            <HStack key={`${topic.examId}-${topic.topic}`} justify="between" align="center" gap="sm" wrap>
              <VStack gap="3xs">
                <Link to={`/app/exams/${topic.examId}`}>{typo(topic.topic)}</Link>
                <Text variant="mini" color="supplementary">
                  {typo(`${topic.examTitle} · ${cardsCountLabel(topic.cardCount)}`)}
                </Text>
              </VStack>
              <Text variant="small" bold color="supplementary">
                {`${Math.round(topic.readiness * 100)}%`}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </SimpleCard>
  );
}

function CalibrationSection({ stats }: { stats: OverallStats }) {
  const buckets: readonly { key: keyof OverallStats["confidenceBuckets"]; label: string }[] = [
    { key: "sure", label: typo("«точно знаю» (90–100)") },
    { key: "confident", label: typo("«уверен» (70–89)") },
    { key: "unsure", label: typo("ниже 70") },
  ];
  const hasConfidence = buckets.some((bucket) => stats.confidenceBuckets[bucket.key].total > 0);

  return (
    <SimpleCard title={typo("Калибровка")} size="lg">
      <Text variant="small" color="supplementary">
        {typo(
          "Главный враг подготовки — иллюзия беглости: знакомый текст кажется выученным. Здесь видно, где самооценка расходится с фактом.",
        )}
      </Text>

      <VStack gap="2xs">
        <Text variant="small" bold>
          {typo("Прогноз против факта")}
        </Text>
        {stats.forecasts.length ? (
          // max-w-2xl: строки «метка — значение» на всю ширину контейнера разрывают связь глазом.
          <VStack gap="2xs" className="max-w-2xl">
            {stats.averageForecastDelta !== null && (
              <Text variant="small">{forecastSummaryOf(stats.averageForecastDelta)}</Text>
            )}
            {stats.forecasts.map((forecast) => (
              <HStack key={forecast.id} justify="between" align="center" gap="sm" wrap>
                <Text variant="small" color="supplementary">
                  {typo(`${formatDateRuMsk(new Date(forecast.createdAt))} · ${forecast.examTitle}`)}
                </Text>
                <Text variant="small" bold>
                  {typo(`прогноз ${forecast.predictedPercent}% → факт ${forecast.actualPercent}%`)}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : (
          <Text variant="small" color="supplementary">
            {typo(
              "Прогнозов пока нет. Перед одной из ближайших сессий приложение предложит предсказать результат — соглашайся, это лучший тренажёр самооценки.",
            )}
          </Text>
        )}
      </VStack>

      <VStack gap="2xs">
        <Text variant="small" bold>
          {typo("Уверенность против результата")}
        </Text>
        {hasConfidence ? (
          <VStack gap="sm">
            {/* Две колонки «думал / оказалось» только с md: на 390 метки ломались,
                а бары ужимались вдвое — на base метка встаёт над баром. */}
            <div className="hidden md:block">
              <AdaptiveGrid cols={{ base: 2 }} gap="sm">
                <Text variant="mini" color="supplementary">
                  {typo("Думал")}
                </Text>
                <Text variant="mini" color="supplementary">
                  {typo("Оказалось")}
                </Text>
              </AdaptiveGrid>
            </div>
            {buckets.map((bucket) => {
              const row = stats.confidenceBuckets[bucket.key];
              return (
                <AdaptiveGrid key={bucket.key} cols={{ base: 1, md: 2 }} gap="sm" className="md:items-center">
                  <Text variant="small">{bucket.label}</Text>
                  {row.total ? (
                    <VStack gap="3xs">
                      <Text variant="small" bold>
                        {typo(
                          `${percentLabel(row.correct, row.total)} верно · ${row.total} ${pluralRu(row.total, "ответ", "ответа", "ответов")}`,
                        )}
                      </Text>
                      <ProgressBar value={row.correct / row.total} />
                    </VStack>
                  ) : (
                    <Text variant="small" color="supplementary">
                      {typo("нет ответов")}
                    </Text>
                  )}
                </AdaptiveGrid>
              );
            })}
            <Text variant="mini" color="supplementary">
              {typo(
                "Уверенные промахи — не провал, а удача: ошибки, в которых ты был уверен, после показа ответа исправляются лучше остальных (гиперкоррекция). Они попадают в приоритет ближайших сессий.",
              )}
            </Text>
          </VStack>
        ) : (
          <Text variant="small" color="supplementary">
            {typo(
              "Отмечай уверенность ползунком перед ответом — здесь появится честное сравнение «кажется, знаю» с реальностью.",
            )}
          </Text>
        )}
      </VStack>
    </SimpleCard>
  );
}

function FormatsSection({ stats }: { stats: OverallStats }) {
  if (!stats.formats.length) {
    return (
      <SimpleCard title={typo("Форматы карточек")}>
        <Text variant="small" color="supplementary">
          {typo("Пока нет ответов. После первых сессий здесь будет видно, какие форматы даются легче.")}
        </Text>
      </SimpleCard>
    );
  }
  return (
    <SimpleCard title={typo("Форматы карточек")}>
      {/* Бар точности заполняет ширину строки данными — без «пустыни» между меткой и значением. */}
      <VStack gap="sm">
        {stats.formats.map((format) => (
          <VStack key={format.format} gap="3xs">
            <HStack justify="between" align="center" gap="sm" wrap>
              <Text variant="small" color="supplementary">
                {cardFormatLabel(format.format)}
              </Text>
              <Text variant="small" bold>
                {typo(
                  `точность ${percentLabel(format.correct, format.total)} · ${format.total} ${pluralRu(format.total, "ответ", "ответа", "ответов")}`,
                )}
              </Text>
            </HStack>
            <ProgressBar value={format.total ? format.correct / format.total : 0} />
          </VStack>
        ))}
      </VStack>
    </SimpleCard>
  );
}

function StatsPage() {
  const stats = Route.useLoaderData();

  return (
    <VStack gap="xl">
      <Heading variant="h1">{typo("Статистика")}</Heading>

      <ReadinessSection stats={stats} />

      <SimpleCard title={typo("Активность")} size="lg">
        <AdaptiveGrid cols={{ base: 2, md: 4 }} gap="sm">
          <Stat label={typo("Серия")} value={stats.streakDays} hint={typo("дней подряд")} />
          <Stat label={typo("Лучшая серия")} value={stats.bestStreak} hint={typo("дней")} />
          <Stat label={typo("Сегодня")} value={stats.reviewsToday} hint={typo("ответов")} />
          <Stat label={typo("Заморозки")} value={stats.freezesLeft} hint={typo("из 2 в месяц")} />
        </AdaptiveGrid>
        {stats.totalReviews ? (
          <ActivityBars activity={stats.activity} />
        ) : (
          <Text variant="small" color="supplementary">
            {typo("Ответов пока нет — пройди первую сессию, и календарь оживёт.")}
          </Text>
        )}
        <Text variant="mini" color="supplementary">
          {typo(`Всего ответов: ${stats.totalReviews} · общая точность ${Math.round(stats.accuracy * 100)}%`)}
        </Text>
      </SimpleCard>

      <CalibrationSection stats={stats} />

      <FormatsSection stats={stats} />
    </VStack>
  );
}
