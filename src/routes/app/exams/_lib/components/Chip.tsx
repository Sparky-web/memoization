import { type PropsWithChildren } from "react";

import { Button } from "~/components";

interface ChipProps extends PropsWithChildren {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Чип-переключатель (формат экзамена, минуты, фильтры, вкладки): один из вариантов активен. */
export function Chip({ active, disabled, onClick, children }: ChipProps) {
  return (
    <Button variant={active ? "secondary" : "outline"} size="sm" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
