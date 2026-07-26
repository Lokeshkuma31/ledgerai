import Link from "next/link";
import ImportHistoryList from "@/components/ImportHistoryList";

export default function ImportSettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Import History</h1>
        <p className="text-muted-foreground text-sm">
          Every CSV import you&apos;ve run, with counts and any skipped rows.
        </p>
      </div>
      <ImportHistoryList />
    </main>
  );
}
