import { GraduationCap } from "lucide-react";
import { type PropsWithChildren } from "react";

import { Container, HStack, Link, Text } from "~/components";
import { typo } from "~/lib";

interface SiteHeaderProps extends PropsWithChildren {
  /** Классы внутреннего контейнера — чтобы шапка выравнивалась по контенту страницы (max-w-*). */
  containerClassName?: string;
}

/** Липкая шапка внешних страниц: блюр поверх контента, логотип-градиент слева, слот действий справа. */
export function SiteHeader({ children, containerClassName }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <Container className={containerClassName}>
        <HStack justify="between" align="center" gap="md" className="h-14">
          <Link to="/" className="shrink-0">
            <HStack gap="xs" align="center">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-brand-foreground shadow-card">
                <GraduationCap className="size-5" strokeWidth={1.8} />
              </span>
              <Text bold>{typo("Домашник")}</Text>
            </HStack>
          </Link>
          {children}
        </HStack>
      </Container>
    </header>
  );
}
