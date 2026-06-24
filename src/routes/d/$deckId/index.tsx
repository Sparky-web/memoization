import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Badge, Button, Container, Heading, HStack, MarkdownView, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { publicDeckQueries, useAddFavorite } from "../_lib";

export const Route = createFileRoute("/d/$deckId/")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(publicDeckQueries.detail(params.deckId)),
  head: () => ({ meta: [{ title: typo("Колода") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PublicDeckPage,
});

function PublicDeckPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const { data: deck } = useSuspenseQuery(publicDeckQueries.detail(deckId));
  const favorite = useAddFavorite(deckId);

  const openDeck = () => {
    void navigate({ to: "/app/decks/$deckId", params: { deckId } });
  };

  // Действие зависит от того, кто смотрит: владелец, уже добавивший, вошедший гость или аноним.
  const renderActions = () => {
    if (deck.isOwner) {
      return <Button onClick={openDeck}>{typo("Открыть колоду")}</Button>;
    }
    if (deck.isFavorite) {
      return (
        <HStack gap="sm" align="center" wrap>
          <Button onClick={openDeck}>{typo("Открыть колоду")}</Button>
          <Badge variant="muted">{typo("В избранном")}</Badge>
        </HStack>
      );
    }
    if (deck.isAuthenticated) {
      return (
        <Button
          disabled={favorite.isPending}
          onClick={() => {
            favorite.mutate();
          }}
        >
          {typo("Добавить в избранное")}
        </Button>
      );
    }
    return (
      <Button
        onClick={() => {
          void navigate({ to: "/auth/signin" });
        }}
      >
        {typo("Войти, чтобы добавить")}
      </Button>
    );
  };

  // Сервер уже отдаёт только превью карточек; остальные доступны после добавления к себе.
  const restCount = deck.totalCards - deck.cards.length;

  return (
    <main className="min-h-dvh overflow-y-auto">
      <Container className="py-8">
        <VStack gap="xl">
          <VStack gap="sm">
            <Text variant="mini" color="supplementary">
              {typo("Мемокарты")}
            </Text>
            <Heading variant="h1">{typo(deck.title)}</Heading>
            <Text variant="small" color="supplementary">
              {deck.authorName
                ? typo(`Автор: ${deck.authorName} · карточек: ${deck.totalCards}`)
                : typo(`Карточек: ${deck.totalCards}`)}
            </Text>
            {deck.description && <Text color="supplementary">{typo(deck.description)}</Text>}
            {renderActions()}
            {!deck.isAuthenticated && (
              <Text variant="mini" color="supplementary">
                {typo("Колоду можно добавить к себе и учить со своим прогрессом — для этого нужен вход.")}
              </Text>
            )}
          </VStack>

          <VStack gap="md">
            <Heading variant="h3">{typo("Карточки")}</Heading>
            <VStack gap="sm">
              {deck.cards.map((card) => (
                <VStack key={card.id} gap="2xs" className="bg-card rounded-2xl p-4">
                  <Text bold>{typo(card.question)}</Text>
                  <MarkdownView>{card.answer}</MarkdownView>
                </VStack>
              ))}
            </VStack>
            {restCount > 0 && (
              <Text variant="small" color="supplementary">
                {typo(`…и ещё ${restCount} карточек`)}
              </Text>
            )}
          </VStack>
        </VStack>
      </Container>
    </main>
  );
}
