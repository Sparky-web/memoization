import { createFileRoute, redirect } from "@tanstack/react-router";

// Корень админки самостоятельного экрана не имеет — ведём на метрики.
export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard" });
  },
});
