import { Container, HStack, Link } from "~/components";
import { typo } from "~/lib";

import { type HeaderUser, UserMenu } from "./UserMenu";

interface AppHeaderProps {
  user: HeaderUser;
}

// Пункт навигации: тихий по умолчанию, активный — тёмный текст + короткое подчёркивание.
const navLinkClasses = "relative py-1 font-medium text-muted-foreground transition-colors hover:text-foreground";

const activeNavProps = {
  className:
    "font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:mx-auto after:h-0.5 after:w-5 after:rounded-full after:bg-primary after:content-['']",
};

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
      <Container className="py-3">
        <HStack justify="between" align="center" gap="md">
          {/* Словомарка с градиентной точкой-акцентом; на мобильном место отдаём навигации. */}
          <Link to="/app" className="hidden items-baseline gap-0.5 sm:flex">
            <span className="font-headings text-(length:--heading-4-font-size) font-extrabold tracking-tight">
              {typo("Домашник")}
            </span>
            <span aria-hidden className="size-2 rounded-full bg-brand-gradient" />
          </Link>
          <HStack gap="lg" align="center">
            <Link to="/app" activeOptions={{ exact: true }} activeProps={activeNavProps} className={navLinkClasses}>
              {typo("Сегодня")}
            </Link>
            <Link
              to="/app/exams"
              activeOptions={{ exact: true }}
              activeProps={activeNavProps}
              className={navLinkClasses}
            >
              {typo("Экзамены")}
            </Link>
            <Link to="/app/stats" activeProps={activeNavProps} className={navLinkClasses}>
              {typo("Статистика")}
            </Link>
            <UserMenu user={user} />
          </HStack>
        </HStack>
      </Container>
    </header>
  );
}
