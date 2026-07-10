import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Check, Landmark, Plus, Sparkles, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import {
  Button,
  ConfirmDialog,
  Heading,
  HStack,
  InlineMath,
  Input,
  PaywallCard,
  SimpleCard,
  Text,
  Textarea,
  VStack,
} from "~/components";
import { isPaywallError, type PalaceLocus, typo } from "~/lib";
import {
  createMemoryPalace,
  deleteMemoryPalace,
  generatePalaceImages,
  getPalaceContext,
  updateMemoryPalace,
} from "~/server/fn/palaces";

// Мастер дворца памяти для «упрямых» карточек-списков: знакомый маршрут → места по порядку →
// яркие абсурдные образы (ИИ помогает, пользователь правит). Странное запоминается.

const palaceContextQuery = (cardId: string) =>
  queryOptions({
    queryKey: ["palace", "context", cardId],
    queryFn: () => getPalaceContext({ data: { cardId } }),
  });

export const Route = createFileRoute("/app/exams/$examId/palace/$cardId/")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(palaceContextQuery(params.cardId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: typo("Дворец памяти") }] }),
  notFoundComponent: () => (
    <VStack gap="md">
      <Heading variant="h1">{typo("Карточка не найдена")}</Heading>
      <Text color="supplementary">{typo("Ссылка неверна или карточка удалена.")}</Text>
    </VStack>
  ),
  component: PalacePage,
});

const ROUTE_PRESETS: readonly string[] = [typo("Моя квартира"), typo("Дорога до универа"), typo("Родительский дом")];

const MIN_PLACES = 4;
const MAX_PLACES = 8;

const WIZARD_STEPS: readonly string[] = [typo("Маршрут"), typo("Места"), typo("Образы")];

// Шаги мастера: активный — брендовый кружок, пройденные — спокойная галочка, будущие — тише.
function WizardSteps({ current }: { current: number }) {
  const circleClass = (stepIndex: number): string => {
    if (stepIndex < current) return "bg-primary/15 text-primary";
    if (stepIndex === current) return "bg-brand-gradient text-brand-foreground shadow-card";
    return "bg-muted text-muted-foreground";
  };

  return (
    <HStack gap="xs" align="center" wrap>
      {WIZARD_STEPS.map((label, stepIndex) => (
        <Fragment key={label}>
          {stepIndex > 0 && <span aria-hidden className="h-px w-4 shrink-0 bg-border" />}
          <HStack gap="2xs" align="center">
            <span
              aria-hidden
              className={`flex size-7 shrink-0 items-center justify-center rounded-full ${circleClass(stepIndex)}`}
            >
              {stepIndex < current ? (
                <Check className="size-4" strokeWidth={2.5} />
              ) : (
                <Text variant="mini" bold>
                  {String(stepIndex + 1)}
                </Text>
              )}
            </span>
            {/* На телефоне подпись только у активного шага — иначе лента не влезает в строку. */}
            <span className={stepIndex === current ? "" : "hidden sm:block"}>
              <Text
                variant="small"
                bold={stepIndex === current}
                color={stepIndex === current ? "main" : "supplementary"}
              >
                {label}
              </Text>
            </span>
          </HStack>
        </Fragment>
      ))}
    </HStack>
  );
}

// Номер места на маршруте: тёплый акцентный кружок — «крючок», на который вешается образ.
function PlaceNumber({ value }: { value: number }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
    >
      <Text variant="mini" bold>
        {String(value)}
      </Text>
    </span>
  );
}

// Шаг 1: знакомый маршрут. Знакомость мест — опора мнемоники, поэтому выбор из своих.
function RouteStep({ onNext }: { onNext: (routeTitle: string) => void }) {
  const [preset, setPreset] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const routeTitle = custom.trim() || preset || "";

  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <WizardSteps current={0} />
        <VStack gap="2xs">
          <Heading variant="h3" asParagraph>
            {typo("Выберите знакомый маршрут")}
          </Heading>
          <Text variant="small" color="supplementary">
            {typo("Место, которое вы знаете наизусть: по нему пойдёт воображаемая прогулка с пунктами списка.")}
          </Text>
        </VStack>
        <HStack gap="2xs" wrap>
          {ROUTE_PRESETS.map((option) => (
            <Button
              key={option}
              variant={preset === option && !custom.trim() ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setPreset(option);
                setCustom("");
              }}
            >
              {option}
            </Button>
          ))}
        </HStack>
        <Input
          value={custom}
          placeholder={typo("Или свой маршрут: «дача», «спортзал»…")}
          onChange={(event) => {
            setCustom(event.target.value);
          }}
        />
        <HStack>
          <Button
            size="pill"
            variant="brand"
            disabled={!routeTitle}
            onClick={() => {
              onNext(routeTitle);
            }}
          >
            {typo("Дальше")}
          </Button>
        </HStack>
      </VStack>
    </SimpleCard>
  );
}

// Шаг 2: места маршрута по порядку — будущие «крючки» для пунктов списка.
function PlacesStep({
  routeTitle,
  onNext,
  onBack,
}: {
  routeTitle: string;
  onNext: (places: string[]) => void;
  onBack: () => void;
}) {
  const [places, setPlaces] = useState<string[]>(["", "", "", ""]);
  const filled = places.map((place) => place.trim()).filter(Boolean);

  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <WizardSteps current={1} />
        <VStack gap="2xs">
          <Heading variant="h3" asParagraph breakWords>
            {typo(`Места маршрута «${routeTitle}»`)}
          </Heading>
          <Text variant="small" color="supplementary">
            {typo("Перечислите 4–8 мест строго по порядку, как идёте: прихожая → кухня → балкон…")}
          </Text>
        </VStack>
        <VStack gap="2xs">
          {places.map((place, index) => (
            <HStack key={index} gap="sm" align="center">
              <PlaceNumber value={index + 1} />
              <Input
                value={place}
                placeholder={typo(`Место ${index + 1}`)}
                onChange={(event) => {
                  setPlaces((current) =>
                    current.map((value, position) => (position === index ? event.target.value : value)),
                  );
                }}
              />
            </HStack>
          ))}
        </VStack>
        <HStack gap="sm" wrap>
          {places.length < MAX_PLACES && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPlaces((current) => [...current, ""]);
              }}
            >
              <Plus className="size-4" />
              {typo("Ещё место")}
            </Button>
          )}
          <Button
            size="pill"
            variant="brand"
            disabled={filled.length < MIN_PLACES}
            onClick={() => {
              onNext(filled);
            }}
          >
            {typo("Дальше")}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            {typo("Назад")}
          </Button>
        </HStack>
      </VStack>
    </SimpleCard>
  );
}

// Редактируемые тройки «место ↔ пункт ↔ образ» — общий блок шага 3 и режима правки.
function LociEditor({ loci, onChange }: { loci: PalaceLocus[]; onChange: (next: PalaceLocus[]) => void }) {
  const patch = (index: number, field: "item" | "image", value: string) => {
    onChange(loci.map((locus, position) => (position === index ? { ...locus, [field]: value } : locus)));
  };

  // Поля внутри плашки локуса — без собственной рамки (bg-card, граница только фокус-кольцом):
  // иначе выходит запрещённая манифестом «рамка-в-рамке-в-рамке».
  const fieldClasses = "border-transparent bg-card shadow-none";

  return (
    <VStack gap="sm">
      {loci.map((locus, index) => (
        <VStack key={index} gap="2xs" className="rounded-2xl bg-muted/50 p-3">
          <HStack gap="sm" align="center">
            <PlaceNumber value={index + 1} />
            <Text variant="small" bold breakWords>
              {/* Метка места — read-only, может нести формулу $…$ (item/image редактируются ниже). */}
              <InlineMath>{locus.place}</InlineMath>
            </Text>
          </HStack>
          <Input
            value={locus.item}
            placeholder={typo("Пункт списка")}
            className={fieldClasses}
            onChange={(event) => {
              patch(index, "item", event.target.value);
            }}
          />
          <Textarea
            value={locus.image}
            rows={2}
            placeholder={typo("Яркий абсурдный образ, связывающий пункт с местом")}
            className={fieldClasses}
            onChange={(event) => {
              patch(index, "image", event.target.value);
            }}
          />
        </VStack>
      ))}
    </VStack>
  );
}

// Шаг 3: ИИ придумывает образы, пользователь правит и сохраняет дворец.
function ImagesStep({
  cardId,
  routeTitle,
  places,
  onSaved,
  onBack,
}: {
  cardId: string;
  routeTitle: string;
  places: string[];
  onSaved: () => void;
  onBack: () => void;
}) {
  const [loci, setLoci] = useState<PalaceLocus[]>([]);
  const complete = loci.length > 0 && loci.every((locus) => locus.item.trim() && locus.image.trim());

  const generate = useMutation({
    mutationFn: () => generatePalaceImages({ data: { cardId, places } }),
    onSuccess: (result) => {
      setLoci(result.loci);
    },
    onError: (error) => {
      if (isPaywallError(error, "CHAT")) return;
      console.error(error);
      const humanMessage = /[а-яё]/i.test(error.message) ? error.message : typo("Не удалось придумать образы");
      toast.error(humanMessage);
    },
  });

  const save = useMutation({
    mutationFn: () =>
      createMemoryPalace({
        data: {
          cardId,
          title: routeTitle,
          loci: loci.map((locus) => ({ place: locus.place, item: locus.item.trim(), image: locus.image.trim() })),
        },
      }),
    onSuccess: onSaved,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить дворец"));
    },
  });

  const seedManual = () => {
    setLoci(places.map((place) => ({ place, item: "", image: "" })));
  };

  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <WizardSteps current={2} />
        <VStack gap="2xs">
          <Heading variant="h3" asParagraph>
            {typo("Яркие образы")}
          </Heading>
          <Text variant="small" color="supplementary">
            {typo(
              "Чем страннее и конкретнее образ, тем крепче он держится. Правьте варианты ИИ под себя — свои образы работают лучше.",
            )}
          </Text>
        </VStack>

        {!loci.length && (
          <HStack gap="sm" wrap>
            <Button
              variant="brand"
              disabled={generate.isPending}
              onClick={() => {
                generate.mutate();
              }}
            >
              <Sparkles className="size-4" />
              {generate.isPending ? typo("Придумываем…") : typo("Придумать образы с ИИ")}
            </Button>
            <Button variant="outline" onClick={seedManual}>
              {typo("Заполню сам")}
            </Button>
          </HStack>
        )}

        {isPaywallError(generate.error, "CHAT") && <PaywallCard reason="CHAT" compact />}

        {loci.length > 0 && (
          <VStack gap="md">
            <LociEditor loci={loci} onChange={setLoci} />
            <HStack gap="sm" wrap>
              <Button
                size="pill"
                variant="brand"
                disabled={!complete || save.isPending}
                onClick={() => {
                  save.mutate();
                }}
              >
                {typo("Сохранить дворец")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={generate.isPending}
                onClick={() => {
                  generate.mutate();
                }}
              >
                {typo("Пересобрать образы")}
              </Button>
            </HStack>
          </VStack>
        )}

        <HStack>
          <Button variant="ghost" onClick={onBack}>
            {typo("Назад к местам")}
          </Button>
        </HStack>
      </VStack>
    </SimpleCard>
  );
}

// Существующий дворец: правка троек, сохранение, удаление.
function EditPalace({
  examId,
  palace,
}: {
  examId: string;
  palace: { id: string; title: string; loci: PalaceLocus[] };
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loci, setLoci] = useState<PalaceLocus[]>(palace.loci);
  // Дворец строится вручную и стоит усилий — удаление только через подтверждение.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const complete = loci.length > 0 && loci.every((locus) => locus.item.trim() && locus.image.trim());

  const exitToHub = () => {
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["palace"] });
    void navigate({ to: "/app/exams/$examId", params: { examId } });
  };

  const save = useMutation({
    mutationFn: () => updateMemoryPalace({ data: { id: palace.id, loci } }),
    onSuccess: () => {
      toast.success(typo("Дворец обновлён"));
      exitToHub();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось сохранить дворец"));
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteMemoryPalace({ data: { id: palace.id } }),
    onSuccess: exitToHub,
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось удалить дворец"));
    },
  });

  return (
    <SimpleCard size="lg">
      <VStack gap="md">
        <Text bold>{typo(`Маршрут «${palace.title}»`)}</Text>
        <LociEditor loci={loci} onChange={setLoci} />
        <HStack gap="sm" wrap>
          <Button
            disabled={!complete || save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {typo("Сохранить")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={remove.isPending}
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="size-4" />
            {typo("Удалить дворец")}
          </Button>
        </HStack>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={typo("Удалить дворец памяти?")}
          description={typo("Маршрут и придуманные образы будут удалены безвозвратно.")}
          confirmLabel={typo("Удалить")}
          confirmPending={remove.isPending}
          onConfirm={() => {
            remove.mutate();
          }}
        />
      </VStack>
    </SimpleCard>
  );
}

function PalacePage() {
  const { examId, cardId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: context } = useSuspenseQuery(palaceContextQuery(cardId));

  const [routeTitle, setRouteTitle] = useState<string | null>(null);
  const [places, setPlaces] = useState<string[] | null>(null);

  const onSaved = () => {
    toast.success(typo("Дворец сохранён — он появится на карточке"));
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["palace"] });
    void navigate({ to: "/app/exams/$examId", params: { examId } });
  };

  const renderStep = () => {
    if (context.palace) return <EditPalace examId={examId} palace={context.palace} />;
    if (!routeTitle) return <RouteStep onNext={setRouteTitle} />;
    if (!places) {
      return (
        <PlacesStep
          routeTitle={routeTitle}
          onNext={setPlaces}
          onBack={() => {
            setRouteTitle(null);
          }}
        />
      );
    }
    return (
      <ImagesStep
        cardId={cardId}
        routeTitle={routeTitle}
        places={places}
        onSaved={onSaved}
        onBack={() => {
          setPlaces(null);
        }}
      />
    );
  };

  return (
    <VStack gap="md" className="mx-auto w-full max-w-2xl">
      <VStack gap="2xs">
        <HStack gap="sm" align="center">
          <Landmark aria-hidden className="size-6 shrink-0 text-primary" strokeWidth={1.8} />
          <Heading variant="h1">{typo("Дворец памяти")}</Heading>
        </HStack>
        <Text variant="small" color="supplementary" breakWords>
          {typo(`Для карточки: ${context.card.prompt}`)}
        </Text>
        <Text variant="mini" color="supplementary" breakWords>
          {typo(`Список для запоминания: ${context.card.answer}`)}
        </Text>
      </VStack>
      {renderStep()}
    </VStack>
  );
}
