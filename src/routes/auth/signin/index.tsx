import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient, Button, Input, Label, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AuthShell } from "../_lib";

export const Route = createFileRoute("/auth/signin/")({
  head: () => ({ meta: [{ title: typo("Вход — Домашник") }] }),
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
    <AuthShell title={typo("С возвращением")} subtitle={typo("Войди — план и прогресс на месте")}>
      <form onSubmit={handleSubmit}>
        <VStack gap="md">
          <VStack gap="xs">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="h-10 rounded-lg"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </VStack>
          <VStack gap="xs">
            <Label htmlFor="password">{typo("Пароль")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-10 rounded-lg"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </VStack>
          <Button type="submit" variant="brand" size="pill" className="w-full" disabled={isPending}>
            {typo("Войти")}
          </Button>
          <Text variant="small" color="supplementary" align="center">
            {typo("Нет аккаунта?")}{" "}
            <Link to="/auth/signup" variant="insideText">
              {typo("Зарегистрироваться")}
            </Link>
          </Text>
        </VStack>
      </form>
    </AuthShell>
  );
}
