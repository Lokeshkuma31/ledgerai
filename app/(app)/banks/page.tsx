import BankDashboard from "@/components/BankDashboard";
import DataSourceStatusStrip from "@/components/dataSources/DataSourceStatusStrip";
import { getConnections } from "@/lib/connections/engine";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function BanksPage() {
  const userId = await getCurrentUserId();
  const connections = userId ? await getConnections(userId) : [];

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Connected institutions, accounts, and sync history — every connector
        runs through the Bank Connector Framework&apos;s standardized
        interfaces, so a real bank integration can replace a demo connector
        later without changing anything else here.
      </p>
      <DataSourceStatusStrip connections={connections} />
      <BankDashboard />
    </div>
  );
}
