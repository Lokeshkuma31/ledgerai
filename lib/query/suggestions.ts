export interface SuggestionContext {
  hasTransactions: boolean;
  hasBudgets: boolean;
  hasSubscriptions: boolean;
}

const DEFAULT_SUGGESTIONS = [
  "How much did I spend on food this month?",
  "Which merchants cost me the most?",
  "Did I exceed any budgets?",
  "How much can I safely spend this week?",
  "Show my recurring subscriptions.",
  "What was my biggest purchase last month?",
];

/**
 * Deterministic — contextual suggestions (triggered by what the user
 * already has set up) are prioritized ahead of the generic defaults.
 */
export function generateSuggestions(context: SuggestionContext): string[] {
  const contextual: string[] = [];
  if (context.hasTransactions) contextual.push("What are my biggest expenses?");
  if (context.hasBudgets) contextual.push("Am I on track with my budgets?");
  if (context.hasSubscriptions) contextual.push("Which subscriptions cost me the most?");

  return Array.from(new Set([...contextual, ...DEFAULT_SUGGESTIONS])).slice(0, 6);
}
