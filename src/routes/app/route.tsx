import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { Container } from "~/components";
import { typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

import { AppHeader } from "./_lib/components/AppHeader";

// Приватный раздел: guard beforeLoad + каркас на весь экран (h-dvh: учитывает динамическую панель iOS).
export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/auth/signin" });
    // Имя и почта — для меню пользователя в шапке (доступны детям через route context).
    return { user: { name: session.user.name, email: session.user.email } };
  },
  head: () => ({ meta: [{ title: typo("Мемокарты") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  // Меняется при навигации → область содержимого перемонтируется и проигрывает анимацию появления.
  // Полноэкранный плеер сессии без прокрутки страницы вернётся вместе с новым плеером (волна 3).
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader user={user} />
      <main key={pathname} className="page-enter min-h-0 flex-1 overflow-y-auto">
        <Container className="py-8">
          <Outlet />
        </Container>
      </main>
    </div>
  );
}
