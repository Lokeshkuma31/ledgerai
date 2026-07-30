import Link from "next/link";
import SyncDashboard from "@/components/SyncDashboard";

export default function SyncPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Synchronization</h1>
        <p className="text-muted-foreground text-sm">
          The single engine every connected provider — email, banks, SMS, documents, and future plugins —
          synchronizes through: scheduling, queueing, retries, conflict handling, and history, all in one place.
        </p>
      </div>
      <SyncDashboard />
    </main>
  );
}
