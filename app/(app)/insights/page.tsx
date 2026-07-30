import InsightsPageContent from "@/components/insights/InsightsPageContent";

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Where your money actually goes, computed from your full transaction
        history.
      </p>
      <InsightsPageContent />
    </div>
  );
}
