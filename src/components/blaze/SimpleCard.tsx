import { type HTMLAttributes, type ReactNode, useMemo } from "react";

import { cn } from "../utils/cn";
import { Size } from "../utils/consts";
import { Heading } from "./Heading";

interface SimpleCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: string | ReactNode;
  size?: "md" | "lg";
}

export const SimpleCard = ({ children, title, size = "md", ...props }: SimpleCardProps) => {
  const titleComponent = useMemo(() => {
    if (!title) {
      return null;
    }
    if (size === Size.lg) {
      return <Heading variant="h2">{title}</Heading>;
    }
    return <Heading variant="h3">{title}</Heading>;
  }, [size, title]);

  return (
    <div
      {...props}
      className={cn(
        "bg-card grid content-start gap-4 rounded-2xl p-4 shadow-none",
        size === Size.lg && "gap-6 p-6",
        props.className,
      )}
    >
      {titleComponent}
      {children}
    </div>
  );
};
