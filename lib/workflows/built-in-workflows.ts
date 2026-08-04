/**
 * The 4 built-in workflow definitions, as plain serializable data — the
 * production successor to lib/workflows/registry.ts's builtInWorkflows()
 * seed-on-first-localStorage-read pattern. Every new Organization gets
 * these seeded (see prisma/seed.ts for dev/preview, and the Better Auth
 * sign-up flow for real users) via an upsert keyed on
 * (organizationId, key) — WorkflowDefinition.key holds this module's `key`
 * field, WorkflowDefinition.id is a separate auto-generated cuid (see the
 * schema comment on WorkflowDefinition for why the two can't be the same
 * column in a multi-tenant table).
 */

export interface BuiltInWorkflowStep {
  id: string;
  engine: string;
  action: string;
  label: string;
}

export interface BuiltInWorkflowDefinition {
  key: string;
  name: string;
  description: string;
  trigger: string;
  steps: BuiltInWorkflowStep[];
  priority: number;
}

function step(id: string, engine: string, action: string, label: string): BuiltInWorkflowStep {
  return { id, engine, action, label };
}

function fullRefreshSteps(): BuiltInWorkflowStep[] {
  return [
    step("timeline", "timeline", "generateTimeline", "Timeline Refresh"),
    step("insights", "insights", "generateInsights", "Insights Refresh"),
    step("budget", "budget", "calculateBudgetStatus", "Budget Recalculation"),
    step("recurring", "recurring", "detectRecurring", "Recurring Detection"),
    step("forecast", "forecast", "generateForecast", "Forecast Refresh"),
    step("events", "events", "detectFinancialEvent", "Event Detection"),
    step("decision", "decision", "generateRecommendation", "Recommendation Refresh"),
    step("feed", "feed", "createFeedItem", "Feed Refresh"),
    step("policy", "policy", "generateNotificationCandidate", "Notification Policy Refresh"),
    step("index", "semantic-index", "refreshIndex", "Semantic Index Refresh"),
  ];
}

export const BUILT_IN_WORKFLOWS: BuiltInWorkflowDefinition[] = [
  {
    key: "workflow:budget-exceeded",
    name: "Budget Exceeded Response",
    description:
      "Reacts to a budget crossing into exceeded status: raises the event, generates a recommendation and explanation, surfaces a feed item and notification candidate, then refreshes the index and acknowledges the Coach.",
    trigger: "budget-exceeded",
    priority: 90,
    steps: [
      step("detect-event", "events", "detectFinancialEvent", "Generate Financial Event"),
      step("generate-recommendation", "decision", "generateRecommendation", "Generate Recommendation"),
      step("generate-explanation", "explanation", "generateExplanation", "Generate Explanation"),
      step("create-feed-item", "feed", "createFeedItem", "Create Feed Item"),
      step("generate-notification", "policy", "generateNotificationCandidate", "Generate Notification Candidate"),
      step("refresh-index", "semantic-index", "refreshIndex", "Refresh Semantic Index"),
    ],
  },
  {
    key: "workflow:transaction-imported",
    name: "Transaction Imported",
    description:
      "Traces a newly imported transaction through merchant intelligence, classification, memory, recurring detection, forecasting, recommendations, feed, and notification policy.",
    trigger: "transaction-imported",
    priority: 70,
    steps: [
      step("acknowledge-import", "import", "acknowledgeImport", "Transaction Imported"),
      step("merchant-intelligence", "merchant", "acknowledgeMerchant", "Merchant Intelligence"),
      step("classification", "classifier", "acknowledgeClassification", "Classification"),
      step("memory-lookup", "memory", "acknowledgeMemory", "Memory Lookup"),
      step("recurring-detection", "recurring", "detectRecurring", "Recurring Detection"),
      step("forecast-update", "forecast", "generateForecast", "Forecast Update"),
      step("recommendation", "decision", "generateRecommendation", "Recommendation"),
      step("feed-update", "feed", "createFeedItem", "Feed Update"),
      step("notification-candidate", "policy", "generateNotificationCandidate", "Notification Candidate"),
    ],
  },
  {
    key: "workflow:daily-refresh",
    name: "Daily Refresh",
    description:
      "The full deterministic recompute — timeline, insights, budgets, recurring, forecast, events, recommendations, feed, notification policy, and the semantic index — run in dependency order.",
    trigger: "daily-refresh",
    priority: 50,
    steps: fullRefreshSteps(),
  },
  {
    key: "workflow:manual-run",
    name: "Manual Full Refresh",
    description: "The same full recompute as Daily Refresh, available to run on demand from the Workflows dashboard.",
    trigger: "manual-run",
    priority: 40,
    steps: fullRefreshSteps(),
  },
];
