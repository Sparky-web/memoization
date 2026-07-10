import { GraduationCap } from "lucide-react";
import { type PropsWithChildren } from "react";

import { Container, Heading, HStack, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";

interface AuthShellProps extends PropsWithChildren {
  title: string;
  subtitle: string;
}

/** Каркас страниц входа/регистрации: бренд сверху, центрированная карточка, мягкое пятно на фоне. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-10 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
      </div>
      <Container className="flex min-h-dvh max-w-md flex-col justify-center py-10">
        <VStack gap="lg" justify="center" className="page-enter w-full">
          <Link to="/" className="mx-auto">
            <HStack gap="xs" align="center">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-brand-foreground shadow-card">
                <GraduationCap className="size-5" strokeWidth={1.8} />
              </span>
              <Text variant="large" bold>
                {typo("Домашник")}
              </Text>
            </HStack>
          </Link>
          <div className="w-full rounded-3xl bg-card p-6 shadow-card md:p-8">
            <VStack gap="lg">
              <VStack gap="2xs">
                <Heading variant="h2" align="center">
                  {title}
                </Heading>
                <Text variant="small" color="supplementary" align="center">
                  {subtitle}
                </Text>
              </VStack>
              {children}
            </VStack>
          </div>
        </VStack>
      </Container>
    </div>
  );
}
