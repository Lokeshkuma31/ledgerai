import Link from "next/link";
import AccountAggregatorDashboard from "@/components/AccountAggregatorDashboard";

export default function AccountAggregatorPluginPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/plugins"
        className="text-muted-foreground w-fit text-sm hover:underline"
      >
        ← Back to Plugins
      </Link>
      <p className="text-muted-foreground max-w-2xl text-sm">
        Consent-based multi-bank aggregation via the Bank Connector
        Framework and Bank Sync Engine — mock provider responses only, so a
        real Account Aggregator (or Open Banking/OAuth) provider can replace
        it later without changing anything else here.
      </p>
      <AccountAggregatorDashboard />
    </div>
  );
}
