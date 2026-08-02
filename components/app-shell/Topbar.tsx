"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Monitor, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import NotificationBell from "@/components/app-shell/NotificationBell";
import { getPageTitle } from "@/lib/nav";

const THEME_CYCLE = ["dark", "light", "system"] as const;
type Theme = (typeof THEME_CYCLE)[number];
const THEME_ICON: Record<Theme, typeof Moon> = {
  dark: Moon,
  light: Sun,
  system: Monitor,
};

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  // Avoid a hydration mismatch: next-themes only knows the real theme after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { crumb, title } = getPageTitle(pathname ?? "/dashboard");
  const currentTheme = mounted ? ((theme as Theme) ?? "dark") : "dark";
  const ThemeIcon = THEME_ICON[currentTheme];

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(currentTheme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  }

  return (
    <header className="border-border bg-background/80 sticky top-0 z-20 flex h-[68px] items-center gap-4 border-b px-5 backdrop-blur-md sm:px-7">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0">
        <div className="text-foreground-subtle text-[11px] font-semibold tracking-wide uppercase">
          {crumb}
        </div>
        <h1 className="font-heading truncate text-[19px] font-semibold tracking-tight">
          {title}
        </h1>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="border-border bg-card text-foreground-subtle hover:border-primary ml-auto hidden min-w-[260px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors sm:flex"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search or ask anything…</span>
        <kbd className="bg-surface-2 border-border text-muted-foreground font-numeric rounded-md border px-1.5 py-0.5 text-[11px]">
          ⌘K
        </kbd>
      </button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onOpenPalette}
        className="sm:hidden"
        aria-label="Search"
      >
        <Search />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={cycleTheme}
        title={`Theme: ${currentTheme}`}
        aria-label={`Switch theme (currently ${currentTheme})`}
      >
        <ThemeIcon />
      </Button>
      <NotificationBell />
    </header>
  );
}
