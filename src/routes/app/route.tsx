import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

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
  return (
    <>
      <AppHeader />
      <Container className="py-8">
        <Outlet />
      </Container>
    </>
  );
}
