import GoalsOverview from "@/components/GoalsOverview";

export default function GoalsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Track progress toward what you&apos;re saving for, using your
        existing transaction and forecast data.
      </p>
      <GoalsOverview />
    </div>
  );
}
