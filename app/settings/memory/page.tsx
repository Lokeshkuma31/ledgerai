import Link from "next/link";
import MemoryManager from "@/components/MemoryManager";

export default function MemorySettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Memory</h1>
        <p className="text-muted-foreground text-sm">
          LedgerAI remembers categories you&apos;ve taught it. Matching notes
          skip the classifier next time.
        </p>
      </div>
      <MemoryManager />
    </main>
  );
}
