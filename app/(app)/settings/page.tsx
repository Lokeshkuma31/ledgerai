import SettingsShell from "@/components/settings/SettingsShell";
import { getAIProviderSummary } from "@/lib/ai/config";
import { getConnections } from "@/lib/connections/engine";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const connections = getConnections();
  const aiSummary = getAIProviderSummary();

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Manage how LedgerAI imports, remembers, and surfaces your financial
        data.
      </p>
      <SettingsShell connections={connections} aiSummary={aiSummary} initialSection={section} />
    </div>
  );
}
