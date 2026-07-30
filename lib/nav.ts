import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
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

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { id: "connections", label: "Connections", href: "/connections", icon: Link2 },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText },
  { id: "emails", label: "Emails", href: "/email", icon: Mail },
  { id: "merchants", label: "Merchants", href: "/merchants", icon: Store },
  { id: "budgets", label: "Budgets", href: "/budgets", icon: PiggyBank },
  { id: "recurring", label: "Recurring", href: "/recurring", icon: Repeat },
  { id: "feed", label: "Feed", href: "/feed", icon: Inbox },
  { id: "forecast", label: "Forecast", href: "/forecast", icon: TrendingUp },
  { id: "insights", label: "Insights", href: "/insights", icon: Lightbulb },
  { id: "goals", label: "Goals", href: "/goals", icon: Target },
  { id: "ai-coach", label: "AI Coach", href: "/ai-coach", icon: Sparkles },
  { id: "search", label: "Search", href: "/search", icon: Search },
  { id: "workflows", label: "Workflows", href: "/workflows", icon: Workflow },
  { id: "plugins", label: "Plugins", href: "/plugins", icon: Puzzle },
  { id: "banks", label: "Banks", href: "/banks", icon: Landmark },
  { id: "sync", label: "Sync", href: "/sync", icon: RefreshCw },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
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
