import Link from "next/link";
import ConnectionHub from "@/components/ConnectionHub";
import { getConnections, getProviderDescriptors } from "@/lib/connections/engine";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; provider?: string }>;
}) {
  const banner = await searchParams;
  const descriptors = getProviderDescriptors();
  const connections = getConnections();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Connections</h1>
        <p className="text-muted-foreground text-sm">
          Connect Gmail, Outlook, or Yahoo via real OAuth 2.0 — tokens are encrypted at rest, held only server-side,
          and never sent to this page. Email synchronization itself is a future milestone; this hub only manages
          the authenticated connection.
        </p>
      </div>
      <ConnectionHub descriptors={descriptors} connections={connections} banner={banner} />
    </main>
  );
}
