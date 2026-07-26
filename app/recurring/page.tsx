import Link from "next/link";
import RecurringOverview from "@/components/RecurringOverview";

export default function RecurringPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Recurring</h1>
        <p className="text-muted-foreground text-sm">
          Subscriptions and recurring income or expenses, detected
          automatically from your transaction history.
        </p>
      </div>
      <RecurringOverview />
    </main>
  );
}
