import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardProvider from "@/components/DashboardProvider";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/recurring"
            className="text-muted-foreground text-sm hover:underline"
          >
            Recurring
          </Link>
          <Link
            href="/goals"
            className="text-muted-foreground text-sm hover:underline"
          >
            Goals
          </Link>
          <Link
            href="/merchants"
            className="text-muted-foreground text-sm hover:underline"
          >
            Merchants
          </Link>
          <Link
            href="/search"
            className="text-muted-foreground text-sm hover:underline"
          >
            Search
          </Link>
          <Link
            href="/workflows"
            className="text-muted-foreground text-sm hover:underline"
          >
            Workflows
          </Link>
          <Link
            href="/plugins"
            className="text-muted-foreground text-sm hover:underline"
          >
            Plugins
          </Link>
          <Link
            href="/settings/import"
            className="text-muted-foreground text-sm hover:underline"
          >
            Imports
          </Link>
          <Link
            href="/settings/sources"
            className="text-muted-foreground text-sm hover:underline"
          >
            Sources
          </Link>
          <Link
            href="/settings/memory"
            className="text-muted-foreground text-sm hover:underline"
          >
            Memory
          </Link>
          <Link
            href="/settings/notifications"
            className="text-muted-foreground text-sm hover:underline"
          >
            Notifications
          </Link>
        </div>
      </div>
      <DashboardProvider>
        <DashboardLayout />
      </DashboardProvider>
    </main>
  );
}
