import { Container, HStack, Link } from "~/components";
import { typo } from "~/lib";

import { type HeaderUser, UserMenu } from "./UserMenu";

interface AppHeaderProps {
  user: HeaderUser;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border">
      <Container className="py-3">
        <HStack justify="between" align="center" gap="md">
          <Link to="/app" className="font-semibold">
            {typo("Мемокарты")}
          </Link>
          <HStack gap="lg" align="center">
            <Link to="/app">{typo("Колоды")}</Link>
            <Link to="/app/stats">{typo("Статистика")}</Link>
            <UserMenu user={user} />
          </HStack>
        </HStack>
      </Container>
    </header>
  );
}
