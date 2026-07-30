import BudgetsPageContent from "@/components/budgets/BudgetsPageContent";

export default function BudgetsPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        How this month&apos;s spending breaks down against each category
        budget you&apos;ve set.
      </p>
      <BudgetsPageContent />
    </div>
  );
}
