import { Landmark } from "lucide-react";
import { useState } from "react";

import { Button, Text, VStack } from "~/components";
import { type PalaceLocus, typo } from "~/lib";

// Свёрнутый блок «Твой дворец»: маршрут дворца памяти на карточке — в плеере
// (экран обратной связи) и в библиотеке. Свёрнут по умолчанию, чтобы не мешать припоминанию.

export function PalaceBlock({ title, loci }: { title: string; loci: PalaceLocus[] }) {
  const [open, setOpen] = useState(false);

  return (
    <VStack gap="2xs" className="rounded-xl bg-accent/40 p-3">
      <Button
        variant="link"
        size="inline"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Landmark aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
        {typo(`Твой дворец: ${title}`)}
      </Button>
      {open && (
        <VStack gap="2xs">
          {loci.map((locus, index) => (
            <VStack key={index} gap="3xs">
              <Text variant="small" bold breakWords>
                {typo(`${index + 1}. ${locus.place} — ${locus.item}`)}
              </Text>
              <Text variant="mini" color="supplementary" breakWords>
                {typo(locus.image)}
              </Text>
            </VStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
