import { typo } from "~/lib";

import { HStack } from "../blaze/HStack";
import { Text } from "../blaze/Text";
import { VStack } from "../blaze/VStack";
import { Button } from "./button";
import { ResponsiveModal } from "./ResponsiveModal";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Надпись на красной кнопке подтверждения. */
  confirmLabel: string;
  /** Блокирует кнопку подтверждения, пока действие выполняется. */
  confirmPending?: boolean;
  onConfirm: () => void;
}

/** Подтверждение деструктивного действия: описание + красная кнопка и «Отмена». Закрытие после успеха — на вызывающей стороне. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmPending,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} hideCloseButton>
      <VStack gap="lg">
        <Text color="supplementary">{description}</Text>
        <HStack gap="sm" wrap>
          <Button variant="destructive" disabled={confirmPending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    </ResponsiveModal>
  );
}
