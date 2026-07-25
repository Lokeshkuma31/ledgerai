"use client";

import { useDashboard } from "@/components/DashboardProvider";
import DashboardSections from "@/components/DashboardSections";

/**
 * Shows a loading state while the orchestrator prepares the first
 * FinancialState. Once one is available, it stays on screen — a later
 * refresh (e.g. after adding an expense) shows a small "Refreshing..."
 * indicator instead of blanking already-known-good data.
 */
export default function DashboardLayout() {
  const { state, isLoading } = useDashboard();

  if (!state) {
    return (
      <p className="text-muted-foreground py-16 text-center">
        Loading your financial overview...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading && (
        <p className="text-muted-foreground text-xs">Refreshing…</p>
      )}
      <DashboardSections state={state} />
      {process.env.NODE_ENV === "development" && state.warnings.length > 0 && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-xs">
          <p className="font-medium">Dev warnings:</p>
          <ul className="list-disc pl-4">
            {state.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
