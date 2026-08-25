"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/nav";
import { useCurrentUser } from "@/hooks/auth/use-current-user";
import { useLogout } from "@/hooks/auth/use-logout";

/** Daily-use destinations shown directly in the sidebar. Everything else
 * (data-source management, automation, secondary analytics) is real and
 * still reachable — via the "More" disclosure below, Cmd+K, or Settings —
 * just not competing for attention on every screen. Mirrors how Linear/
 * Notion-style sidebars keep the primary rail short. */
const ESSENTIAL_IDS = new Set([
  "dashboard",
  "ai-coach",
  "search",
  "transactions",
  "budgets",
  "analytics",
  "goals",
]);

const UNGROUPED = NAV_ITEMS.filter((item) => !item.group);
const ESSENTIAL_BY_GROUP = NAV_GROUPS.map((group) => ({
  group,
  items: NAV_ITEMS.filter((item) => item.group === group && ESSENTIAL_IDS.has(item.id)),
})).filter((section) => section.items.length > 0);
const MORE_ITEMS = NAV_ITEMS.filter(
  (item) => item.group && item.id !== "settings" && !ESSENTIAL_IDS.has(item.id),
);
const SETTINGS_ITEM = NAV_ITEMS.find((item) => item.id === "settings");

function NavMenuItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <SidebarMenuItem key={item.id}>
      <SidebarMenuButton isActive={isActive} tooltip={item.label} render={<Link href={item.href} />}>
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(item.href + "/");
  const [moreOpen, setMoreOpen] = useState(() => MORE_ITEMS.some(isActive));
  const { state: sidebarState } = useSidebar();
  const showMoreItems = moreOpen || sidebarState === "collapsed";
  const { data: currentUser } = useCurrentUser();
  const logout = useLogout();

  const displayName = currentUser?.user.name || currentUser?.user.email || "Your account";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation" role="navigation">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-ai font-heading text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(194,65,12,0.7)]">
            L
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-heading text-[15px] font-semibold tracking-tight">
              LedgerAI
            </div>
            <div className="truncate text-[11px] text-foreground-subtle">
              Your money, sorted
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {UNGROUPED.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {UNGROUPED.map((item) => (
                  <NavMenuItem key={item.id} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {ESSENTIAL_BY_GROUP.map(({ group, items }) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <NavMenuItem key={item.id} item={item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {SETTINGS_ITEM && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavMenuItem item={SETTINGS_ITEM} pathname={pathname} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {MORE_ITEMS.length > 0 && (
          <SidebarGroup>
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              className="flex h-8 w-full shrink-0 items-center justify-between rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-hidden transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            >
              <span>More</span>
              <ChevronDown
                className={`size-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
            {showMoreItems && (
              <SidebarGroupContent>
                <SidebarMenu>
                  {MORE_ITEMS.map((item) => (
                    <NavMenuItem key={item.id} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2.5 rounded-lg p-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-stone-600 to-stone-500 text-[13px] font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-[13px] font-semibold">{displayName}</div>
            <div className="truncate text-[11px] text-foreground-subtle">
              {currentUser?.organizationName ?? "Signed in"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Sign out"
            title="Sign out"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
