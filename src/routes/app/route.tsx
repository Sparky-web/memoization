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
  },
  head: () => ({ meta: [{ title: typo("Мемокарты") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AppLayout,
});

function AppLayout() {
  // Меняется при навигации → область содержимого перемонтируется и проигрывает анимацию появления.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Экран повторения занимает весь экран без прокрутки страницы (скролл — только внутри карточки).
  const isStudy = pathname.endsWith("/study");

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      {isStudy ? (
        <main key={pathname} className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      ) : (
        <main key={pathname} className="page-enter min-h-0 flex-1 overflow-y-auto">
          <Container className="py-8">
            <Outlet />
          </Container>
        </main>
      )}
    </div>
  );
}
