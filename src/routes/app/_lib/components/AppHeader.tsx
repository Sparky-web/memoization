import { useNavigate } from "@tanstack/react-router";

import { authClient, Button, Container, HStack, Link } from "~/components";
import { typo } from "~/lib";

export function AppHeader() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/auth/signin" });
  };

  return (
    <header className="border-border shrink-0 border-b">
      <Container className="py-3">
        <HStack justify="between" align="center" gap="md">
          <Link to="/app" className="font-semibold">
            {typo("Мемокарты")}
          </Link>
          <HStack gap="lg" align="center">
            <Link to="/app">{typo("Колоды")}</Link>
            <Link to="/app/stats">{typo("Статистика")}</Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              {typo("Выйти")}
            </Button>
          </HStack>
        </HStack>
      </Container>
    </header>
  );
}
