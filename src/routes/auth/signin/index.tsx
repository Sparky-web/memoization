import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient, Button, Container, Heading, Input, Label, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";

export const Route = createFileRoute("/auth/signin/")({
  head: () => ({ meta: [{ title: typo("Вход") }] }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setIsPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    setIsPending(false);
    if (error) {
      toast.error(typo("Неверный логин или пароль"));
      return;
    }
    await navigate({ to: "/app" });
  };

  return (
    <Container className="page-enter flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <VStack gap="md">
          <Heading variant="h2">{typo("Вход")}</Heading>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>
          <div>
            <Label htmlFor="password">{typo("Пароль")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {typo("Войти")}
          </Button>
          <Text variant="small" color="supplementary">
            {typo("Нет аккаунта?")}{" "}
            <Link to="/auth/signup" variant="underline">
              {typo("Зарегистрироваться")}
            </Link>
          </Text>
        </VStack>
      </form>
    </Container>
  );
}
