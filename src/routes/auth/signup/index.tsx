import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authClient, Button, Input, Label, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";

import { AuthShell } from "../_lib";

export const Route = createFileRoute("/auth/signup/")({
  head: () => ({ meta: [{ title: typo("Регистрация — Домашник") }] }),
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
    <AuthShell title={typo("Регистрация")} subtitle={typo("Минута — и появится первый экзамен с планом")}>
      <form onSubmit={handleSubmit}>
        <VStack gap="md">
          <VStack gap="xs">
            <Label htmlFor="name">{typo("Имя")}</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              className="h-10 rounded-lg"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </VStack>
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
              autoComplete="new-password"
              required
              minLength={8}
              className="h-10 rounded-lg"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </VStack>
          <Button type="submit" variant="brand" size="pill" className="w-full" disabled={isPending}>
            {typo("Зарегистрироваться")}
          </Button>
          <Text variant="small" color="supplementary" align="center">
            {typo("Уже есть аккаунт?")}{" "}
            <Link to="/auth/signin" variant="insideText">
              {typo("Войти")}
            </Link>
          </Text>
          <Text variant="mini" color="supplementary" align="center">
            {typo("Регистрируясь, ты соглашаешься с ")}
            <Link to="/offer" variant="insideText">
              {typo("офертой")}
            </Link>
            {typo(" и ")}
            <Link to="/privacy" variant="insideText">
              {typo("политикой конфиденциальности")}
            </Link>
            {typo(".")}
          </Text>
        </VStack>
      </form>
    </AuthShell>
  );
}
