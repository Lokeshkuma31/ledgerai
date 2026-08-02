import ConnectionHub from "@/components/ConnectionHub";
import DataSourceStatusStrip from "@/components/dataSources/DataSourceStatusStrip";
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
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Connect Gmail, Outlook, or Yahoo via real OAuth 2.0 — tokens are
        encrypted at rest, held only server-side, and never sent to this
        page. Email synchronization itself is a future milestone; this hub
        only manages the authenticated connection.
      </p>
      <DataSourceStatusStrip connections={connections} />
      <ConnectionHub
        descriptors={descriptors}
        connections={connections}
        banner={banner}
      />
    </div>
  );
}
