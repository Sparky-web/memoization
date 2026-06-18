import { type PropsWithChildren } from "react";

import { cn } from "../utils/cn";

interface ContainerProps extends PropsWithChildren {
  className?: string;
}

export const Container = ({ children, className }: ContainerProps) => {
  return <div className={cn("mx-auto w-full max-w-6xl px-4", className)}>{children}</div>;
};
