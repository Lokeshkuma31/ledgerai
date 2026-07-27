/**
 * Published extension point for plugins that want the AI Financial Coach
 * to receive a summary of what they did — mirrors
 * lib/feed/engine.ts's registerFeedContributor and
 * lib/index/index.ts's registerIndexContributor. Kept in its own module
 * (rather than inside lib/coach/coach.ts) because coach.ts is a Next.js
 * "use server" file — every export from it must be an async server
 * action, so a plain synchronous registry can't live there.
 *
 * Called from a plugin's own register()/unregister(); returns an
 * unregister function. lib/intelligence/orchestrator.ts collects
 * contributions once per FinancialState build and hands them to the Coach
 * as CoachInput.importSummaries — the Coach only narrates these, it never
 * decides what an import summary means.
 */
export interface CoachImportSummaryContribution {
  /** Human-readable plugin name, e.g. "Android SMS & Notification Source". */
  pluginName: string;
  totalMessages: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  lastImportAt: string | null; // ISO 8601, or null if never imported
}

const contributors = new Set<() => CoachImportSummaryContribution | null>();

export function registerCoachImportSummaryContributor(
  contributor: () => CoachImportSummaryContribution | null,
): () => void {
  contributors.add(contributor);
  return () => {
    contributors.delete(contributor);
  };
}

/** A misbehaving plugin must never break Coach summary generation for
 * everyone else — each contributor runs in its own try/catch. */
export function collectCoachImportSummaries(): CoachImportSummaryContribution[] {
  const summaries: CoachImportSummaryContribution[] = [];
  for (const contributor of contributors) {
    try {
      const result = contributor();
      if (result) summaries.push(result);
    } catch (error) {
      console.error("An import-summary plugin threw while contributing to the Coach:", error);
    }
  }
  return summaries;
}
