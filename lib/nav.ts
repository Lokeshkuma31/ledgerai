import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  Inbox,
  Landmark,
  Lightbulb,
  Link2,
  Mail,
  LayoutDashboard,
  Puzzle,
  PiggyBank,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";

/** Groups the sidebar/Cmd+K use to communicate priority instead of a flat
 * 19-item list — see the design spec's Information Architecture phase.
 * Optional so a NavItem without one still renders (ungrouped, in a flat
 * list) rather than being silently dropped. */
export const NAV_GROUPS = ["Overview", "Money", "Data Sources", "System"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group?: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview" },
  { id: "ai-coach", label: "AI Coach", href: "/ai-coach", icon: Sparkles, group: "Overview" },
  { id: "search", label: "Search", href: "/search", icon: Search, group: "Overview" },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3, group: "Money" },
  { id: "transactions", label: "Transactions", href: "/transactions", icon: ArrowLeftRight, group: "Money" },
  { id: "merchants", label: "Merchants", href: "/merchants", icon: Store, group: "Money" },
  { id: "budgets", label: "Budgets", href: "/budgets", icon: PiggyBank, group: "Money" },
  { id: "recurring", label: "Recurring", href: "/recurring", icon: Repeat, group: "Money" },
  { id: "forecast", label: "Forecast", href: "/forecast", icon: TrendingUp, group: "Money" },
  { id: "insights", label: "Insights", href: "/insights", icon: Lightbulb, group: "Money" },
  { id: "goals", label: "Goals", href: "/goals", icon: Target, group: "Money" },
  { id: "connections", label: "Connections", href: "/connections", icon: Link2, group: "Data Sources" },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText, group: "Data Sources" },
  { id: "emails", label: "Emails", href: "/email", icon: Mail, group: "Data Sources" },
  { id: "banks", label: "Banks", href: "/banks", icon: Landmark, group: "Data Sources" },
  { id: "sync", label: "Sync", href: "/sync", icon: RefreshCw, group: "Data Sources" },
  { id: "feed", label: "Feed", href: "/feed", icon: Inbox, group: "System" },
  { id: "workflows", label: "Workflows", href: "/workflows", icon: Workflow, group: "System" },
  { id: "plugins", label: "Plugins", href: "/plugins", icon: Puzzle, group: "System" },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings, group: "System" },
];

/** Known sub-route titles that aren't a top-level nav destination on their own. */
const SUB_ROUTE_TITLES: Record<string, string> = {
  "/settings/import": "Import History",
  "/settings/memory": "Memory",
  "/settings/notifications": "Notifications",
  "/settings/sources": "Sources",
  "/plugins/account-aggregator": "Account Aggregator",
  "/plugins/android-sms": "Android SMS",
};

/**
 * Resolves the topbar breadcrumb/title for a pathname by finding the
 * longest matching nav item prefix — so nested routes (e.g. a merchant
 * detail page, a settings sub-page) still highlight the right parent
 * section and fall back to a readable title.
 */
export function getPageTitle(pathname: string): { crumb: string; title: string } {
  if (SUB_ROUTE_TITLES[pathname]) {
    const parent = NAV_ITEMS.find((item) => pathname.startsWith(item.href + "/"));
    return { crumb: parent?.label ?? "LedgerAI", title: SUB_ROUTE_TITLES[pathname] };
  }

  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }

  return { crumb: "LedgerAI", title: best?.label ?? "Overview" };
}
