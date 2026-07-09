import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Crown, LogOut, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import { useState } from "react";

import { authClient, Button, HStack, Text, useTheme, VStack } from "~/components";
import { formatDateRuMsk, typo } from "~/lib";

import { dashboardQueries } from "../model/dashboardQueries";

export interface HeaderUser {
  name: string;
  email: string;
}

interface UserMenuProps {
  user: HeaderUser;
}

/** Меню пользователя в шапке: аватар-кружок с инициалом, имя (на десктопе), дропдаун с темой и выходом. */
export function UserMenu({ user }: UserMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { isDark, setDark } = useTheme();

  // Статус подписки и флаг админа нужны только внутри открытого меню — не дёргаем сервер на каждый рендер шапки.
  const { data: billing } = useQuery({ ...dashboardQueries.billing(), enabled: open });
  const { data: adminAccess } = useQuery({ ...dashboardQueries.adminAccess(), enabled: open });

  const initial = (user.name.trim().charAt(0) || user.email.charAt(0) || "?").toUpperCase();

  const handleSignOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/auth/signin" });
  };

  const goPricing = () => {
    setOpen(false);
    void navigate({ to: "/pricing" });
  };

  const goAdmin = () => {
    setOpen(false);
    void navigate({ to: "/admin/dashboard" });
  };

  const goSettings = () => {
    setOpen(false);
    void navigate({ to: "/app/settings" });
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={typo("Меню пользователя")}
        className="flex cursor-pointer items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
          {initial}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{typo(user.name)}</span>
      </button>

      {open && (
        <>
          {/* Прозрачная подложка: клик мимо меню закрывает его. */}
          <button
            type="button"
            aria-label={typo("Закрыть меню")}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => {
              setOpen(false);
            }}
          />
          <div className="absolute top-full right-0 z-50 mt-2 w-64 rounded-2xl border border-border bg-card p-4 shadow-lg">
            <VStack gap="md">
              <VStack gap="3xs">
                <Text bold maxLines={1}>
                  {typo(user.name)}
                </Text>
                <Text variant="small" color="supplementary" maxLines={1}>
                  {user.email}
                </Text>
              </VStack>

              <VStack gap="2xs">
                <Text variant="mini" color="supplementary">
                  {typo("Подписка")}
                </Text>
                {billing?.pro ? (
                  <Button variant="outline" size="sm" onClick={goPricing}>
                    <Crown className="size-4" />
                    {billing.currentPeriodEnd
                      ? typo(`Pro до ${formatDateRuMsk(billing.currentPeriodEnd)}`)
                      : typo("Pro активен бессрочно")}
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={goPricing}>
                    <Crown className="size-4" />
                    {typo("Открыть Pro")}
                  </Button>
                )}
              </VStack>

              <VStack gap="2xs">
                <Text variant="mini" color="supplementary">
                  {typo("Тема")}
                </Text>
                <HStack gap="2xs">
                  <Button
                    variant={isDark ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => {
                      setDark(false);
                    }}
                  >
                    <Sun className="size-4" />
                    {typo("Светлая")}
                  </Button>
                  <Button
                    variant={isDark ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setDark(true);
                    }}
                  >
                    <Moon className="size-4" />
                    {typo("Тёмная")}
                  </Button>
                </HStack>
              </VStack>

              <Button variant="outline" size="sm" onClick={goSettings}>
                <Settings className="size-4" />
                {typo("Настройки")}
              </Button>

              {adminAccess?.isAdmin && (
                <Button variant="outline" size="sm" onClick={goAdmin}>
                  <ShieldCheck className="size-4" />
                  {typo("Админка")}
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="size-4" />
                {typo("Выйти")}
              </Button>
            </VStack>
          </div>
        </>
      )}
    </div>
  );
}
