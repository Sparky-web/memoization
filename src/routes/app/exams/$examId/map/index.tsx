import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Heading, HStack, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { type PaywallReason, paywallReasonOf, typo } from "~/lib";

import { Chip, examQueries } from "../../_lib";
import { MapEditor } from "./_lib/components/MapEditor";
import { generateConceptMapDraft, mapQueries } from "./_lib/model/mapModel";

// Карта связей: черновик-скелет от ИИ по вопросам темы + достройка руками в SVG-редакторе.

export const Route = createFileRoute("/app/exams/$examId/map/")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(examQueries.detail(params.examId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: typo("Карта связей") }] }),
  notFoundComponent: () => (
    <VStack gap="md">
      <Heading variant="h1">{typo("Экзамен не найден")}</Heading>
      <Text color="supplementary">{typo("Ссылка неверна или экзамен удалён.")}</Text>
    </VStack>
  ),
  component: ConceptMapPage,
});

// Секция генерации черновика: тема + запуск. Пейволы: MAPS (вторая карта Free) и CHAT (квота).
function DraftSection({ examId, onCreated }: { examId: string; onCreated: (mapId: string) => void }) {
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const [topic, setTopic] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const topics = exam.topics.flatMap((entry) => (entry.topic ? [entry.topic] : []));

  const generate = useMutation({
    mutationFn: () => generateConceptMapDraft({ data: { examId, topic: topic ?? undefined } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
      onCreated(result.id);
    },
    onError: (error) => {
      const reason = paywallReasonOf(error);
      if (reason) {
        setPaywall(reason);
        return;
      }
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось построить черновик");
      toast.error(humanMessage);
    },
  });

  return (
    <SimpleCard>
      <VStack gap="sm">
        <VStack gap="3xs">
          <Text bold>{typo("Черновик от ИИ")}</Text>
          <Text variant="mini" color="supplementary">
            {typo(
              "Строить схему самому полезнее, чем смотреть готовую, — черновик от ИИ только скелет: достраивайте связи руками.",
            )}
          </Text>
        </VStack>
        {topics.length > 0 && (
          <HStack gap="2xs" wrap>
            <Chip
              active={!topic}
              onClick={() => {
                setTopic(null);
              }}
            >
              {typo("Весь экзамен")}
            </Chip>
            {topics.map((option) => (
              <Chip
                key={option}
                active={topic === option}
                onClick={() => {
                  setTopic(option);
                }}
              >
                {typo(option)}
              </Chip>
            ))}
          </HStack>
        )}
        <HStack>
          <Button
            variant="outline"
            disabled={generate.isPending}
            onClick={() => {
              generate.mutate();
            }}
          >
            <Sparkles className="size-4" />
            {generate.isPending ? typo("Строим…") : typo("Набросать черновик")}
          </Button>
        </HStack>
        {paywall && <PaywallCard reason={paywall} compact />}
      </VStack>
    </SimpleCard>
  );
}

function ConceptMapPage() {
  const { examId } = Route.useParams();
  const maps = useQuery(mapQueries.list(examId));
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  const mapList = maps.data ?? [];
  const activeMap = mapList.find((map) => map.id === activeMapId) ?? mapList[0] ?? null;

  return (
    <VStack gap="md">
      <VStack gap="2xs">
        <Heading variant="h1">{typo("Карта связей")}</Heading>
        <Text color="supplementary">
          {typo("Понятия темы и связи между ними: схема, построенная своими руками, укладывает материал в систему.")}
        </Text>
      </VStack>

      <DraftSection examId={examId} onCreated={setActiveMapId} />

      {maps.isLoading && <div className="h-72 animate-pulse rounded-2xl bg-muted" />}

      {!maps.isLoading && !mapList.length && (
        <SimpleCard>
          <Text color="supplementary">
            {typo(
              "Карт пока нет. Набросайте черновик от ИИ и достройте его — или начните с чистого листа, сгенерировав скелет по любой теме.",
            )}
          </Text>
        </SimpleCard>
      )}

      {mapList.length > 1 && (
        <HStack gap="2xs" wrap>
          {mapList.map((map) => (
            <Chip
              key={map.id}
              active={activeMap?.id === map.id}
              onClick={() => {
                setActiveMapId(map.id);
              }}
            >
              {typo(map.title)}
            </Chip>
          ))}
        </HStack>
      )}

      {activeMap && <MapEditor key={activeMap.id} map={activeMap} examId={examId} />}
    </VStack>
  );
}
