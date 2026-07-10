import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ReactNode } from "react";
import { Drawer } from "vaul";

import { typo } from "~/lib";

import { useMediaQuery } from "../blaze/useMediaQuery";
import { Button } from "./button";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** Скрыть кнопку «Закрыть» на ПК — когда контент сам содержит действия закрытия (например, подтверждение). */
  hideCloseButton?: boolean;
}

// На ПК — диалог по центру (radix), на мобиле — нижний drawer (vaul). Контент внутри скроллится.
export function ResponsiveModal({ open, onOpenChange, title, children, hideCloseButton }: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/50 dark:bg-background/70" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-3xl bg-card p-6 shadow-card-hover focus:outline-none"
          >
            <DialogPrimitive.Title className="text-(length:--heading-3-font-size) font-semibold">
              {title}
            </DialogPrimitive.Title>
            <div className="overflow-y-auto">{children}</div>
            {!hideCloseButton && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                {typo("Закрыть")}
              </Button>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/50 dark:bg-background/70" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 rounded-t-3xl bg-card p-4 pb-8 focus:outline-none"
        >
          <div className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-muted" />
          <Drawer.Title className="px-1 text-(length:--heading-3-font-size) font-semibold">{title}</Drawer.Title>
          <div className="overflow-y-auto px-1">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
