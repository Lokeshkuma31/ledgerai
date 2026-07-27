import Link from "next/link";
import PluginSettings from "@/components/PluginSettings";

export default function PluginsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-muted-foreground w-fit text-sm hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Plugins</h1>
        <p className="text-muted-foreground text-sm">
          Every transaction source — and every future integration — runs through this
          same plugin framework instead of modifying the core platform directly.
        </p>
      </div>
      <PluginSettings />
    </main>
  );
}
