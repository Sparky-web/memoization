import { BookOpen, CalendarCheck, ChartColumn, Settings2 } from "lucide-react";

import { Link, Text } from "~/components";
import { typo } from "~/lib";

interface TabItem {
  to: "/app" | "/app/exams" | "/app/stats" | "/app/settings";
  label: string;
  icon: typeof CalendarCheck;
}

const TABS: readonly TabItem[] = [
  { to: "/app", label: typo("Сегодня"), icon: CalendarCheck },
  { to: "/app/exams", label: typo("Экзамены"), icon: BookOpen },
  { to: "/app/stats", label: typo("Статистика"), icon: ChartColumn },
  { to: "/app/settings", label: typo("Настройки"), icon: Settings2 },
];

function isTabActive(to: TabItem["to"], pathname: string): boolean {
  if (to === "/app") return pathname === "/app";
  return pathname.startsWith(to);
}

/** Нижний таб-бар мобильной навигации (<lg); в полноэкранных флоу его скрывает AppLayout. */
export function AppTabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="shrink-0 border-t border-border bg-card lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => {
          const active = isTabActive(tab.to, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={
                active
                  ? "flex w-full flex-col items-center gap-1 py-2 text-primary"
                  : "flex w-full flex-col items-center gap-1 py-2 text-muted-foreground"
              }
            >
              <tab.icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
              <Text variant="mini" bold={active} color={active ? "primary" : "supplementary"}>
                {tab.label}
              </Text>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
