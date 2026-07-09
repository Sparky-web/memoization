import { Container, HStack, Link } from "~/components";
import { typo } from "~/lib";

import { type HeaderUser, UserMenu } from "./UserMenu";

interface AppHeaderProps {
  user: HeaderUser;
}

const activeNavProps = { className: "text-primary" };

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border">
      <Container className="py-3">
        <HStack justify="between" align="center" gap="md">
          <Link to="/app" className="hidden font-semibold sm:inline">
            {typo("Мемокарты")}
          </Link>
          <HStack gap="lg" align="center">
            <Link to="/app" activeOptions={{ exact: true }} activeProps={activeNavProps}>
              {typo("Сегодня")}
            </Link>
            <Link to="/app/exams" activeOptions={{ exact: true }} activeProps={activeNavProps}>
              {typo("Экзамены")}
            </Link>
            <Link to="/app/stats" activeProps={activeNavProps}>
              {typo("Статистика")}
            </Link>
            <UserMenu user={user} />
          </HStack>
        </HStack>
      </Container>
    </header>
  );
}
