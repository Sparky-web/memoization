import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, EmptyState, Heading, HStack, PaywallCard, SimpleCard, Text, VStack } from "~/components";
import { type PaywallReason, paywallReasonOf, typo } from "~/lib";

import { Chip, examQueries } from "../../_lib";
import { MapWorkspace } from "./_lib/components/MapWorkspace";
import { createConceptMap, generateConceptMapDraft, mapQueries } from "./_lib/model/mapModel";

// Карта связей: связи строятся списком «Понятие А —(подпись)→ Понятие Б», граф рисуется сам.
// Ценность — в формулировании связей самим студентом (строить схему полезнее, чем смотреть
// готовую); ИИ-черновик лишь набрасывает скелет списка.

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

// Человеческий текст ошибки мутации: пейволы наверх, остальное — тостом.
function reportMutationError(error: Error, fallback: string, onPaywall: (reason: PaywallReason) => void) {
  const reason = paywallReasonOf(error);
  if (reason) {
    onPaywall(reason);
    return;
  }
  console.error(error);
  toast.error(/[а-яё]/i.test(error.message) ? error.message : fallback);
}

// Черновик от ИИ доливает связи в текущую карту: тема + запуск. Пейвол — квота чата.
function DraftSection({ examId, mapId }: { examId: string; mapId: string }) {
  const queryClient = useQueryClient();
  const { data: exam } = useSuspenseQuery(examQueries.detail(examId));
  const [topic, setTopic] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const topics = exam.topics.flatMap((entry) => (entry.topic ? [entry.topic] : []));

  const generate = useMutation({
    mutationFn: () => generateConceptMapDraft({ data: { examId, topic: topic ?? undefined, mapId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
    },
    onError: (error) => {
      reportMutationError(error, typo("Не удалось построить черновик"), setPaywall);
    },
  });

  return (
    <SimpleCard>
      <VStack gap="sm">
        <VStack gap="3xs">
          <Text bold>{typo("Черновик от ИИ")}</Text>
          <Text variant="mini" color="supplementary">
            {typo(
              "ИИ предложит связи по вопросам темы и добавит их в список. Строить схему самому полезнее — используйте черновик как скелет и достраивайте своими связями.",
            )}
          </Text>
        </VStack>
        {Boolean(topics.length) && (
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
            {generate.isPending ? typo("Строим…") : typo("Предложить черновик")}
          </Button>
        </HStack>
        {paywall && <PaywallCard reason={paywall} compact />}
      </VStack>
    </SimpleCard>
  );
}

function ConceptMapPage() {
  const { examId } = Route.useParams();
  const queryClient = useQueryClient();
  const maps = useQuery(mapQueries.list(examId));
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  // Автофокус формы связи после «Добавить первую связь» — сразу можно печатать.
  const [focusFormMapId, setFocusFormMapId] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const mapList = maps.data ?? [];
  const activeMap = mapList.find((map) => map.id === activeMapId) ?? mapList[0] ?? null;

  const createEmpty = useMutation({
    mutationFn: () => createConceptMap({ data: { examId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
      setActiveMapId(result.id);
      setFocusFormMapId(result.id);
    },
    onError: (error) => {
      reportMutationError(error, typo("Не удалось создать карту"), setPaywall);
    },
  });

  const generateFirstDraft = useMutation({
    mutationFn: () => generateConceptMapDraft({ data: { examId } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["conceptMaps", examId] });
      setActiveMapId(result.id);
    },
    onError: (error) => {
      reportMutationError(error, typo("Не удалось построить черновик"), setPaywall);
    },
  });

  return (
    <VStack gap="md">
      <VStack gap="2xs">
        <Heading variant="h1">{typo("Карта связей")}</Heading>
        <Text color="supplementary">
          {typo("Свяжите понятия темы утверждениями — карта нарисуется сама и уложит материал в систему.")}
        </Text>
      </VStack>

      {maps.isLoading && <div className="h-72 animate-pulse rounded-2xl bg-muted" />}

      {!maps.isLoading && !mapList.length && (
        <SimpleCard>
          <EmptyState
            illustration="map"
            title={typo("Свяжите понятия — карта нарисуется сама")}
            text={typo(
              "Сформулируйте связи вида «понятие → понятие» списком, а раскладку схемы возьмёт на себя Домашник. Можно начать с черновика от ИИ.",
            )}
          >
            <HStack gap="2xs" wrap justify="center">
              <Button
                disabled={generateFirstDraft.isPending || createEmpty.isPending}
                onClick={() => {
                  generateFirstDraft.mutate();
                }}
              >
                <Sparkles className="size-4" />
                {generateFirstDraft.isPending ? typo("Строим…") : typo("Предложить черновик")}
              </Button>
              <Button
                variant="outline"
                disabled={generateFirstDraft.isPending || createEmpty.isPending}
                onClick={() => {
                  createEmpty.mutate();
                }}
              >
                <Plus className="size-4" />
                {typo("Добавить первую связь")}
              </Button>
            </HStack>
          </EmptyState>
          {paywall && <PaywallCard reason={paywall} compact />}
        </SimpleCard>
      )}

      {Boolean(mapList.length) && (
        <VStack gap="sm">
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
          {paywall && <PaywallCard reason={paywall} compact />}
          {activeMap && (
            <MapWorkspace
              key={`${activeMap.id}:${activeMap.updatedAt.getTime()}`}
              map={activeMap}
              examId={examId}
              autoFocusForm={focusFormMapId === activeMap.id}
            />
          )}
        </VStack>
      )}

      {activeMap && <DraftSection examId={examId} mapId={activeMap.id} />}
    </VStack>
  );
}
