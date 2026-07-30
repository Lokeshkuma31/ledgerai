import AiCoachPageContent from "@/components/aicoach/AiCoachPageContent";

export default function AiCoachPage() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground max-w-2xl text-sm">
        Ask about spending, forecasts, or budgets — every answer is grounded
        in your own transaction history, with a proactive summary alongside.
      </p>
      <AiCoachPageContent />
    </div>
  );
}
