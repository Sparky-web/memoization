import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { Container } from "~/components";
import { typo } from "~/lib";

import { AppHeader } from "./_lib/components/AppHeader";
import { AppTabBar } from "./_lib/components/AppTabBar";
import { dashboardQueries } from "./_lib/model/dashboardQueries";

// Приватный раздел: guard beforeLoad + каркас на весь экран (h-dvh: учитывает динамическую панель iOS).
export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context }) => {
    // Сессия читается через кэш react-query: guard не платит серверный roundtrip
    // на каждом внутреннем переходе (при выходе кэш чистит UserMenu).
    const session = await context.queryClient.ensureQueryData(dashboardQueries.authSession());
    if (!session) throw redirect({ to: "/auth/signin" });
    // Имя и почта — для меню пользователя в шапке (доступны детям через route context).
    return { user: { name: session.user.name, email: session.user.email } };
  },
  head: () => ({ meta: [{ title: typo("Домашник") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  // Меняется при навигации → область содержимого перемонтируется (сброс прокрутки)
  // и проигрывает лёгкий fade; сдвиг-анимация на каждый переход читалась как «моргание».
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Плеер сессии — полноэкранный флоу: нижний таб-бар прячется, чтобы ничего не отвлекало.
  const immersive = pathname.includes("/session");

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={user} />
      <main key={pathname} className="page-fade min-h-0 flex-1 overflow-y-auto">
        <Container className="py-8">
          <Outlet />
        </Container>
      </main>
      {!immersive && <AppTabBar pathname={pathname} />}
    </div>
  );
}
