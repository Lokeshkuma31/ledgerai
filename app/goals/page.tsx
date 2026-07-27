import Link from "next/link";
import GoalsOverview from "@/components/GoalsOverview";

export default function GoalsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Savings Goals</h1>
        <p className="text-muted-foreground text-sm">
          Track progress toward what you&apos;re saving for, using your existing transaction and forecast data.
        </p>
      </div>
      <GoalsOverview />
    </main>
  );
}
