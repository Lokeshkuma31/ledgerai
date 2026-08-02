import DataSourceStatusStrip from "@/components/dataSources/DataSourceStatusStrip";
import EmailDashboard from "@/components/EmailDashboard";
import { getConnections } from "@/lib/connections/engine";

export default function EmailPage() {
  const connections = getConnections();

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Financial email classification, extraction, and attachment handling
        — mock provider data only, so a real Gmail API, Microsoft Graph,
        IMAP, or Exchange provider can replace it later without changing
        anything else here.
      </p>
      <DataSourceStatusStrip connections={connections} />
      <EmailDashboard />
    </div>
  );
}
