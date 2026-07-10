import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { typo } from "~/lib";

import { routeTree } from "./routeTree.gen";

function DefaultError({ error }: { error: Error }) {
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">{typo("Что-то пошло не так. Попробуйте обновить страницу.")}</p>
    </div>
  );
}

function PageLoader() {
  // Спиннер в потоке контента (не min-h-screen): внутри /app он появляется под шапкой
  // и таб-баром, не «съедая» весь экран белой вспышкой на медленных переходах.
  return (
    <div className="flex justify-center py-24">
      <div className="size-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
    </div>
  );
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultErrorComponent: DefaultError,
    defaultPendingComponent: PageLoader,
    // Медленный loader показывает pending уже через 300мс (дефолтная секунда «замораживала»
    // старый экран без обратной связи); minMs сглаживает мигание на быстрых ответах.
    defaultPendingMs: 300,
    defaultPendingMinMs: 200,
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
