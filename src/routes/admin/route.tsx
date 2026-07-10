import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, CreditCard, type LucideIcon, Sparkles, Users } from "lucide-react";
import { type ComponentProps } from "react";

import { Heading, Link, Text, VStack } from "~/components";
import { typo } from "~/lib";
import { getAdminAccess } from "~/server/fn/admin";

// Guard приватного раздела: beforeLoad + redirect (см. CLAUDE.md). Аноним получает 401
// от getAdminAccess — catch превращает его в тот же redirect на главную, что и не-админа.
export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const access = await getAdminAccess().catch(() => null);
    if (!access?.isAdmin) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: typo("Админка — Домашник") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AdminLayout,
});

type AdminTo = ComponentProps<typeof Link>["to"];

const NAV_ITEMS: readonly { to: AdminTo; label: string; icon: LucideIcon }[] = [
  { to: "/admin/dashboard", label: typo("Метрики"), icon: BarChart3 },
  { to: "/admin/users", label: typo("Пользователи"), icon: Users },
  { to: "/admin/payments", label: typo("Платежи"), icon: CreditCard },
  { to: "/admin/generation", label: typo("Генерации"), icon: Sparkles },
];

const navLinkClass =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted [&.active]:bg-accent [&.active]:font-bold [&.active]:text-accent-foreground";

// fullWidth — для вертикального сайдбара (пункт на всю ширину); в мобильной горизонтальной
// панели ширина по контенту. Базовый Link приходит с `w-fit`, поэтому растяжку включаем явно.
function NavLink({ to, icon: Icon, label, fullWidth }: { to: AdminTo; icon: LucideIcon; label: string; fullWidth?: boolean }) {
  return (
    <Link to={to} className={fullWidth ? `${navLinkClass} w-full` : navLinkClass}>
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-border bg-card px-4 py-6 md:flex">
        <VStack gap="xl">
          <VStack gap="3xs" className="px-3">
            <Heading variant="h4" asParagraph>
              {typo("Домашник")}
            </Heading>
            <Text variant="mini" color="supplementary">
              {typo("админ-панель")}
            </Text>
          </VStack>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.label} {...item} fullWidth />
            ))}
          </nav>
        </VStack>
        <Link to="/app" className={`${navLinkClass} w-full`}>
          <ArrowLeft className="size-4 shrink-0" />
          {typo("В приложение")}
        </Link>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.label} {...item} />
          ))}
          <Link to="/app" className={`${navLinkClass} ml-auto shrink-0`} aria-label={typo("В приложение")}>
            <ArrowLeft className="size-4 shrink-0" />
          </Link>
        </div>
        <div className="px-5 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
