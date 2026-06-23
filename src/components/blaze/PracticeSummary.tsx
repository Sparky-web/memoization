import { typo } from "~/lib";

import { Button } from "../ui/button";
import { Heading } from "./Heading";
import { HStack } from "./HStack";
import { Stat } from "./Stat";
import { VStack } from "./VStack";

interface PracticeSummaryProps {
  answered: number;
  correct: number;
  onRestart: () => void;
  onExit: () => void;
  restartPending?: boolean;
}

/** Итоги захода в режим тренажёра: решено / верно / точность + «ещё 20» и «к колоде». */
export function PracticeSummary({ answered, correct, onRestart, onExit, restartPending }: PracticeSummaryProps) {
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  return (
    <VStack gap="lg" align="center" justify="center" className="mx-auto h-full w-full max-w-xl px-4">
      <Heading variant="h2" align="center">
        {typo("Заход завершён")}
      </Heading>
      <HStack gap="md" wrap justify="center">
        <Stat label={typo("Решено")} value={answered} />
        <Stat label={typo("Верно")} value={correct} />
        <Stat label={typo("Точность")} value={`${accuracy}%`} />
      </HStack>
      <HStack gap="sm" wrap justify="center">
        <Button onClick={onRestart} disabled={restartPending}>
          {typo("Ещё 20")}
        </Button>
        <Button variant="outline" onClick={onExit}>
          {typo("К колоде")}
        </Button>
      </HStack>
    </VStack>
  );
}
