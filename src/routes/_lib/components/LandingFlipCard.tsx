import { type CSSProperties, type KeyboardEvent, useState } from "react";

import { Heading, Text, VStack } from "~/components";
import { typo } from "~/lib";

const hiddenBackface: CSSProperties = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

/** Интерактивная карточка-пример: настоящий 3D-переворот по клику или Enter/пробелу, как в тренировке. */
export function LandingFlipCard() {
  const [flipped, setFlipped] = useState(false);

  const toggleFlip = () => {
    setFlipped((value) => !value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleFlip();
  };

  return (
    <section>
      <VStack gap="lg" justify="center">
        <VStack gap="xs" justify="center">
          <Heading variant="h2" align="center">
            {typo("Попробуй сам")}
          </Heading>
          <Text color="supplementary" align="center">
            {typo("Сначала вспомни ответ — и только потом переворачивай.")}
          </Text>
        </VStack>

        <div className="w-full max-w-md" style={{ perspective: "1100px" }}>
          <div
            role="button"
            tabIndex={0}
            aria-label={typo("Карточка-пример. Нажмите, чтобы перевернуть")}
            onClick={toggleFlip}
            onKeyDown={handleKeyDown}
            className="relative h-60 cursor-pointer rounded-3xl transition-transform duration-500 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          >
            <div
              className="absolute inset-0 flex flex-col justify-between rounded-3xl bg-card p-6 shadow-md"
              style={hiddenBackface}
            >
              <Text variant="mini" color="supplementary" align="center">
                {typo("Вопрос")}
              </Text>
              <Heading variant="h3" asParagraph align="center">
                {typo("Столица Австралии?")}
              </Heading>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Нажми, чтобы перевернуть")}
              </Text>
            </div>

            <div
              className="absolute inset-0 flex flex-col justify-between rounded-3xl bg-card p-6 shadow-md"
              style={{ ...hiddenBackface, transform: "rotateY(180deg)" }}
            >
              <Text variant="mini" color="supplementary" align="center">
                {typo("Ответ")}
              </Text>
              <VStack gap="3xs" justify="center">
                <Heading variant="h3" asParagraph align="center">
                  {typo("Канберра")}
                </Heading>
                <Text variant="small" color="supplementary" align="center">
                  {typo("(не Сидней!)")}
                </Text>
              </VStack>
              <Text variant="mini" color="supplementary" align="center">
                {typo("Вспомнил? Отлично. Нет — карточка вернётся раньше")}
              </Text>
            </div>
          </div>
        </div>

        <div className="max-w-md">
          <Text variant="small" color="supplementary" align="center">
            {typo("Так работает каждая карточка — вспомнил или нет, решаешь честно.")}
          </Text>
        </div>
      </VStack>
    </section>
  );
}
