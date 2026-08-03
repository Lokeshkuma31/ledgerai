import AnalyticsPageContent from "@/components/analytics/AnalyticsPageContent";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Cash flow and category trends over any time range, computed entirely from your existing
        transaction data — nothing here recalculates a forecast, budget, or recurring payment.
      </p>
      <AnalyticsPageContent />
    </div>
  );
}
