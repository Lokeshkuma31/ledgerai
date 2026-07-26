import Link from "next/link";
import SearchOverview from "@/components/SearchOverview";

export default function SearchPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
        <p className="text-muted-foreground text-sm">
          Search across transactions, merchants, budgets, events,
          recommendations, recurring items, forecasts, and past questions —
          all from one deterministic index.
        </p>
      </div>
      <SearchOverview />
    </main>
  );
}
