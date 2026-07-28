import Link from "next/link";
import AccountAggregatorDashboard from "@/components/AccountAggregatorDashboard";

export default function AccountAggregatorPluginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-1">
        <Link href="/plugins" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Back to Plugins
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Account Aggregator</h1>
        <p className="text-muted-foreground text-sm">
          Consent-based multi-bank aggregation via the Bank Connector Framework and Bank Sync Engine — mock provider
          responses only, so a real Account Aggregator (or Open Banking/OAuth) provider can replace it later without
          changing anything else here.
        </p>
      </div>
      <AccountAggregatorDashboard />
    </main>
  );
}
