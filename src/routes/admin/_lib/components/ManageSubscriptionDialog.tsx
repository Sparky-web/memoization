import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button, HStack, Input, ResponsiveModal, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { setUserSubscription } from "../model/adminMutations";
import { type AdminUserItem } from "../model/adminQueries";

const DAY_MS = 24 * 60 * 60 * 1000;

// Дата по умолчанию: продление на 30 дней от текущего конца Pro (или от сегодня).
function defaultUntilDate(proUntil: Date | null): string {
  const base = proUntil && proUntil > new Date() ? proUntil.getTime() : Date.now();
  return new Date(base + 30 * DAY_MS).toISOString().slice(0, 10);
}

interface ManageSubscriptionDialogProps {
  user: AdminUserItem;
  onClose: () => void;
}

/** Ручное управление Pro: выдать/продлить до даты (provider MANUAL) или отключить немедленно. */
export function ManageSubscriptionDialog({ user, onClose }: ManageSubscriptionDialogProps) {
  const queryClient = useQueryClient();
  const [untilDate, setUntilDate] = useState(defaultUntilDate(user.proUntil));

  const mutation = useMutation({
    mutationFn: (action: "grant" | "revoke") =>
      setUserSubscription({
        data: { userId: user.id, action, untilDate: action === "grant" ? untilDate : undefined },
      }),
    onSuccess: () => {
      toast.success(typo("Подписка обновлена"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (error) => {
      console.error(error);
      toast.error(typo("Не удалось обновить подписку"));
    },
  });

  return (
    <ResponsiveModal
      open
      onOpenChange={(openState) => {
        if (!openState) onClose();
      }}
      title={typo("Управление подпиской")}
      hideCloseButton
    >
      <VStack gap="lg">
        <Text variant="small" color="supplementary" breakWords>
          {user.email}
        </Text>

        <VStack gap="2xs">
          <Text variant="mini" color="supplementary">
            {typo("Pro действует до (конец дня по Москве)")}
          </Text>
          <Input
            type="date"
            value={untilDate}
            onChange={(event) => {
              setUntilDate(event.target.value);
            }}
          />
        </VStack>

        <HStack gap="sm" wrap>
          <Button
            disabled={mutation.isPending || !untilDate}
            onClick={() => {
              mutation.mutate("grant");
            }}
          >
            {user.proUntil ? typo("Продлить Pro до даты") : typo("Выдать Pro до даты")}
          </Button>
          {user.proUntil && (
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.mutate("revoke");
              }}
            >
              {typo("Отключить Pro")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {typo("Отмена")}
          </Button>
        </HStack>
      </VStack>
    </ResponsiveModal>
  );
}
