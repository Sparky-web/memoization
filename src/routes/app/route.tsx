import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { Container } from "~/components";
import { typo } from "~/lib";
import { getSession } from "~/server/fn/auth";

import { AppHeader } from "./_lib/components/AppHeader";

// Приватный раздел: guard beforeLoad + общий каркас (шапка с навигацией).
export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/auth/signin" });
  },
  head: () => ({ meta: [{ title: typo("Мемокарты") }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AppLayout,
});

function AppLayout() {
  // Меняется при навигации → обёртка перемонтируется и проигрывает анимацию появления.
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <>
      <AppHeader />
      <Container className="py-8">
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
      </Container>
    </>
  );
}
