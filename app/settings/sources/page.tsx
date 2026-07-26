import Link from "next/link";
import SourceSettings from "@/components/SourceSettings";

export default function SourcesSettingsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
        <p className="text-muted-foreground text-sm">
          Every transaction in LedgerAI comes from a source plugin. Manage
          which sources are active below.
        </p>
      </div>
      <SourceSettings />
    </main>
  );
}
