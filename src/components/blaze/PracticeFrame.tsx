import { ThumbsDown } from "lucide-react";
import { type ReactNode } from "react";

import { typo } from "~/lib";

import { Button } from "../ui/button";
import { HStack } from "./HStack";
import { ProgressBar } from "./ProgressBar";
import { Text } from "./Text";

interface PracticeFrameProps {
  deckTitle: string;
  /** Сколько заданий уже отвечено (для прогресса и подписи). */
  answered: number;
  total: number;
  onExit: () => void;
  /** Если задан — в шапке появляется кнопка «скрыть задание» (дизлайк). */
  onDislike?: () => void;
  children: ReactNode;
}

/** Каркас режима тренажёра: шапка (колода · прогресс · дизлайк · завершить) + содержимое на весь экран. */
export function PracticeFrame({ deckTitle, answered, total, onExit, onDislike, children }: PracticeFrameProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-3 px-4 py-3">
      <HStack justify="between" align="center" gap="sm" className="shrink-0">
        <div className="min-w-0 flex-1">
          <Text variant="small" color="supplementary" maxLines={1}>
            {typo(deckTitle)}
          </Text>
        </div>
        <HStack gap="sm" align="center" className="shrink-0 whitespace-nowrap">
          <Text variant="small" color="supplementary">
            {`${answered} / ${total}`}
          </Text>
          {onDislike ? (
            <Button variant="ghost" size="icon" onClick={onDislike} title={typo("Скрыть это задание")}>
              <ThumbsDown className="size-4" />
            </Button>
          ) : null}
          <Button variant="link" size="inline" onClick={onExit}>
            {typo("Завершить")}
          </Button>
        </HStack>
      </HStack>

      <ProgressBar value={total ? answered / total : 0} className="shrink-0" />

      {children}
    </div>
  );
}
