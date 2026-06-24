import { toast } from "sonner";

import { Button, HStack, SimpleCard, Text } from "~/components";
import { typo } from "~/lib";

import { useShareDeck } from "../model/deckMutations";

interface ShareDeckControlProps {
  deckId: string;
  isPublic: boolean;
}

// Управление публикацией колоды (для владельца): открыть/закрыть доступ по ссылке и скопировать её.
export function ShareDeckControl({ deckId, isPublic }: ShareDeckControlProps) {
  const share = useShareDeck(deckId);

  // origin берём в момент клика (только браузер) — чтобы не зависеть от него при SSR-рендере.
  const copyLink = () => {
    const link = `${window.location.origin}/d/${deckId}`;
    void navigator.clipboard
      .writeText(link)
      .then(() => {
        toast.success(typo("Ссылка скопирована"));
      })
      .catch((error: unknown) => {
        console.error(error);
        toast.error(typo("Не удалось скопировать ссылку"));
      });
  };

  if (!isPublic) {
    return (
      <HStack>
        <Button
          variant="outline"
          size="sm"
          disabled={share.isPending}
          onClick={() => {
            share.mutate(true);
          }}
        >
          {typo("Поделиться ссылкой")}
        </Button>
      </HStack>
    );
  }

  return (
    <SimpleCard title={typo("Доступ по ссылке открыт")}>
      <Text variant="small" color="supplementary">
        {typo("Любой, у кого есть ссылка, сможет открыть колоду и добавить её в избранное — со своим прогрессом.")}
      </Text>
      <HStack gap="sm" wrap>
        <Button size="sm" onClick={copyLink}>
          {typo("Скопировать ссылку")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={share.isPending}
          onClick={() => {
            share.mutate(false);
          }}
        >
          {typo("Закрыть доступ")}
        </Button>
      </HStack>
    </SimpleCard>
  );
}
