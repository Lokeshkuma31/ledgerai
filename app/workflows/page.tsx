import Link from "next/link";
import WorkflowsOverview from "@/components/WorkflowsOverview";

export default function WorkflowsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Workflows</h1>
        <p className="text-muted-foreground text-sm">
          Reusable, traceable financial workflows that coordinate every other engine —
          registered workflows, their step sequences, and full execution history.
        </p>
      </div>
      <WorkflowsOverview />
    </main>
  );
}
