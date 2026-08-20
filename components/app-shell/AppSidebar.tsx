"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/nav";

const UNGROUPED = NAV_ITEMS.filter((item) => !item.group);
const BY_GROUP = NAV_GROUPS.map((group) => ({
  group,
  items: NAV_ITEMS.filter((item) => item.group === group),
})).filter((section) => section.items.length > 0);

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

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation" role="navigation">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-ai font-heading text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.7)]">
            L
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate font-heading text-[15px] font-semibold tracking-tight">
              Ledgerline
            </div>
            <div className="truncate text-[11px] text-foreground-subtle">
              Financial Intelligence
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
        {BY_GROUP.map(({ group, items }) => (
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
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2.5 rounded-lg p-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-500 text-[13px] font-semibold text-white">
            L
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-[13px] font-semibold">
              Local workspace
            </div>
            <div className="truncate text-[11px] text-foreground-subtle">
              Data stored on this device
            </div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
