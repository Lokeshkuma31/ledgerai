import DataSourceStatusStrip from "@/components/dataSources/DataSourceStatusStrip";
import SyncDashboard from "@/components/SyncDashboard";
import { getConnections } from "@/lib/connections/engine";

export default function SyncPage() {
  const connections = getConnections();

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        The single engine every connected provider — email, banks, SMS,
        documents, and future plugins — synchronizes through: scheduling,
        queueing, retries, conflict handling, and history, all in one place.
      </p>
      <DataSourceStatusStrip connections={connections} />
      <SyncDashboard />
    </div>
  );
}
