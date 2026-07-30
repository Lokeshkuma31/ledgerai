"use client";

import AICoachCard from "@/components/AICoachCard";
import { useDashboard } from "@/components/DashboardProvider";
import FinancialCopilot from "@/components/FinancialCopilot";

export default function AiCoachPageContent() {
  const { state } = useDashboard();

  if (!state) {
    return <p className="text-muted-foreground py-16 text-center">Loading your AI coach...</p>;
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
      <FinancialCopilot state={state} />
      <AICoachCard summary={state.coachSummary} />
    </div>
  );
}
