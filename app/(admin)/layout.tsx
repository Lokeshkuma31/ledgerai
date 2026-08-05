import { redirect } from "next/navigation";
import { getCurrentMembership, getCurrentUserId } from "@/lib/auth/session";

/**
 * Admin route group — gated to organization owners. No admin-gating
 * pattern existed elsewhere in the app before this (see
 * docs/job-platform/08-worker-architecture.md §8.6); this is a new,
 * minimal pattern applied consistently to every route under (admin).
 * Deliberately outside the (app) group's AppShell/nav — a new top-level
 * surface, not a redesign of the existing app shell.
 */
export default async function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/sign-in?redirect=/jobs");

  const membership = await getCurrentMembership();
  if (!membership || membership.role !== "OWNER") redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Job Platform</h1>
          <p className="text-muted-foreground text-sm">Background job execution, retries, and dead-letter inspection.</p>
        </div>
        <a href="/dashboard" className="text-muted-foreground text-sm hover:underline">
          Back to app
        </a>
      </header>
      {children}
    </div>
  );
}
