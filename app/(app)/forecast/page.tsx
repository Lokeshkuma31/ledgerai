import ForecastPageContent from "@/components/forecast/ForecastPageContent";

export default function ForecastPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        A deterministic projection of the rest of this month, built entirely
        from arithmetic over your real transaction history — no AI involved.
      </p>
      <ForecastPageContent />
    </div>
  );
}
