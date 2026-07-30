import RecurringOverview from "@/components/RecurringOverview";

export default function RecurringPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Subscriptions and recurring income or expenses, detected
        automatically from your transaction history.
      </p>
      <RecurringOverview />
    </div>
  );
}
