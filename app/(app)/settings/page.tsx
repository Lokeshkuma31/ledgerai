import Link from "next/link";
import { Database, FileClock, Bell, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SETTINGS_LINKS = [
  {
    href: "/settings/import",
    label: "Import History",
    description: "Every CSV import you've run, with counts and skipped rows.",
    icon: FileClock,
  },
  {
    href: "/settings/sources",
    label: "Sources",
    description: "Manage which source plugins are active.",
    icon: Plug,
  },
  {
    href: "/settings/memory",
    label: "Memory",
    description: "Categories LedgerAI has learned from your corrections.",
    icon: Database,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Choose which financial events deserve your attention.",
    icon: Bell,
  },
];

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Manage how LedgerAI imports, remembers, and surfaces your financial
        data.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SETTINGS_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <Card className="hover:border-primary/40 h-full transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5 text-base">
                  <item.icon className="text-muted-foreground size-4" />
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {item.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
