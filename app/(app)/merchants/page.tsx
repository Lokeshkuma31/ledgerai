import MerchantDirectory from "@/components/MerchantDirectory";
import MerchantStatistics from "@/components/MerchantStatistics";

export default function MerchantsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Every merchant LedgerAI has recognized in your transaction notes,
        normalized into a single canonical identity.
      </p>
      <MerchantStatistics />
      <MerchantDirectory />
    </div>
  );
}
