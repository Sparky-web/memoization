import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient, Button, Container, Heading, Input, Label, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";

export const Route = createFileRoute("/auth/signup/")({
  head: () => ({ meta: [{ title: typo("Регистрация") }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setIsPending(true);
    const { error } = await authClient.signUp.email({ name, email, password });
    setIsPending(false);
    if (error) {
      toast.error(typo("Не удалось зарегистрироваться. Возможно, такая почта уже занята."));
      return;
    }
    await navigate({ to: "/app" });
  };

  return (
    <Container className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <VStack gap="md">
          <Heading variant="h2">{typo("Регистрация")}</Heading>
          <div>
            <Label htmlFor="name">{typo("Имя")}</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {typo("Зарегистрироваться")}
          </Button>
          <Text variant="small" color="supplementary">
            {typo("Уже есть аккаунт?")}{" "}
            <Link to="/auth/signin" variant="underline">
              {typo("Войти")}
            </Link>
          </Text>
        </VStack>
      </form>
    </Container>
  );
}
