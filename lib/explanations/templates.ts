/**
 * Centralized, deterministic string templates — every explanation string
 * in the app should be rendered from here rather than hand-built inline
 * elsewhere. Placeholders are plain `{name}` tokens substituted verbatim;
 * callers (reasoner.ts) are responsible for formatting values (currency,
 * percentages, dates) before passing them in.
 */
export const TEMPLATE_KEYS = [
  "budget-exceeded",
  "budget-warning",
  "budget-safe",
  "forecast-reason",
  "recommendation-reason",
  "recurring-consistent",
  "recurring-missed",
  "recurring-upcoming",
  "event-reason",
  "merchant-profile-reason",
  "insights-reason",
  "timeline-reason",
  "search-result-reason",
  "query-response-reason",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/**
 * Every placeholder used across the templates below draws from the same
 * canonical vocabulary: merchant, category, amount, date, percentage,
 * trend, budget, forecast, risk, count, days, frequency, confidence.
 */
const TEMPLATES: Record<TemplateKey, string> = {
  "budget-exceeded":
    "{category} spending has exceeded the {budget} budget — {percentage} used with {days} days remaining this month.",
  "budget-warning":
    "{category} spending is trending {trend} compared to last month and is approaching its {budget} budget ({percentage} used).",
  "budget-safe": "{category} spending is comfortably within its {budget} budget this month ({percentage} used).",
  "forecast-reason":
    "Expected recurring expenses of {forecast} and a daily safe-spend allowance of {amount} indicate a projected month-end balance of {balance}.",
  "recommendation-reason": "{reason}",
  "recurring-consistent":
    "{merchant} has appeared {frequency} for the last {count} occurrences with consistent amounts.",
  "recurring-missed": "{merchant} was expected around {date} but no matching transaction has been recorded yet.",
  "recurring-upcoming": "{merchant} is expected again around {date} based on its {frequency} pattern.",
  "event-reason": "{reason}",
  "merchant-profile-reason":
    "{merchant} accounts for {amount} across {count} transactions, classified as {category}.",
  "insights-reason":
    "The top spending category is {category}, accounting for {percentage} of total spending across {count} transactions.",
  "timeline-reason": "{count} transaction(s) totaling {amount} during {date}.",
  "search-result-reason": "This {category} matched your search on {trend}.",
  "query-response-reason":
    "This answer was computed from your recorded transactions using the {category} engine. {trend}",
};

/** Substitutes every `{key}` placeholder found in `values` — any
 * placeholder left in the template with no matching key is left as-is
 * rather than throwing, so a caller can render a template with a partial
 * value set. */
export function renderTemplate(key: TemplateKey, values: Record<string, string>): string {
  let result = TEMPLATES[key];
  for (const [placeholder, value] of Object.entries(values)) {
    result = result.split(`{${placeholder}}`).join(value);
  }
  return result;
}
