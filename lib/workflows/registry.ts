import type {
  WorkflowDefinition,
  WorkflowExecutionSummary,
  WorkflowStepDefinition,
  WorkflowTrigger,
} from "@/types/workflow";

const STORAGE_KEY = "ledgerai:workflows";
const MAX_EMBEDDED_HISTORY = 20;

function step(
  id: string,
  engine: WorkflowStepDefinition["engine"],
  action: string,
  label: string,
): WorkflowStepDefinition {
  return { id, engine, action, label };
}

function makeDefinition(
  id: string,
  name: string,
  description: string,
  trigger: WorkflowTrigger,
  steps: WorkflowStepDefinition[],
  priority: number,
  now: Date,
): WorkflowDefinition {
  const timestamp = now.toISOString();
  return {
    id,
    name,
    description,
    trigger,
    steps,
    status: "enabled",
    priority,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastRun: null,
    executionHistory: [],
    metadata: {},
    version: 1,
  };
}

/** The full recompute chain, shared by Daily Refresh and Manual Run — both
 * exist to run it, just from different triggers (an automatic cadence vs.
 * an explicit user action on the Workflows dashboard). */
function fullRefreshSteps(): WorkflowStepDefinition[] {
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

function builtInWorkflows(now: Date = new Date()): WorkflowDefinition[] {
  return [
    makeDefinition(
      "workflow:budget-exceeded",
      "Budget Exceeded Response",
      "Reacts to a budget crossing into exceeded status: raises the event, generates a recommendation and explanation, surfaces a feed item and notification candidate, then refreshes the index and acknowledges the Coach.",
      "budget-exceeded",
      [
        step("detect-event", "events", "detectFinancialEvent", "Generate Financial Event"),
        step("generate-recommendation", "decision", "generateRecommendation", "Generate Recommendation"),
        step("generate-explanation", "explanation", "generateExplanation", "Generate Explanation"),
        step("create-feed-item", "feed", "createFeedItem", "Create Feed Item"),
        step(
          "generate-notification",
          "policy",
          "generateNotificationCandidate",
          "Generate Notification Candidate",
        ),
        step("refresh-index", "semantic-index", "refreshIndex", "Refresh Semantic Index"),
        step("notify-coach", "coach", "notifyCoach", "Notify AI Financial Coach"),
      ],
      100,
      now,
    ),
    makeDefinition(
      "workflow:transaction-imported",
      "Transaction Imported",
      "Traces a newly imported transaction through merchant intelligence, classification, memory, recurring detection, forecasting, recommendations, feed, and notification policy.",
      "transaction-imported",
      [
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
      70,
      now,
    ),
    makeDefinition(
      "workflow:daily-refresh",
      "Daily Refresh",
      "The full deterministic recompute — timeline, insights, budgets, recurring, forecast, events, recommendations, feed, notification policy, and the semantic index — run in dependency order.",
      "daily-refresh",
      fullRefreshSteps(),
      50,
      now,
    ),
    makeDefinition(
      "workflow:manual-run",
      "Manual Full Refresh",
      "The same full recompute as Daily Refresh, available to run on demand from the Workflows dashboard.",
      "manual-run",
      fullRefreshSteps(),
      40,
      now,
    ),
  ];
}

function readWorkflows(): WorkflowDefinition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkflowDefinition[]) : [];
  } catch {
    return [];
  }
}

function writeWorkflows(workflows: WorkflowDefinition[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

/**
 * Read-only accessor that seeds the built-in workflows on first use (an
 * empty registry) so the app always has the example workflows registered
 * without a separate migration step.
 */
export function getAllWorkflows(): WorkflowDefinition[] {
  const existing = readWorkflows();
  if (existing.length > 0) return existing;
  const seeded = builtInWorkflows();
  writeWorkflows(seeded);
  return seeded;
}

export function getWorkflowById(id: string): WorkflowDefinition | undefined {
  return getAllWorkflows().find((w) => w.id === id);
}

/** Enabled and disabled workflows both come back — lib/workflows/runner.ts
 * is the one place that filters for "enabled" before executing. */
export function getWorkflowsByTrigger(trigger: WorkflowTrigger): WorkflowDefinition[] {
  return getAllWorkflows()
    .filter((w) => w.trigger === trigger)
    .sort((a, b) => b.priority - a.priority);
}

function updateWorkflowRecord(
  id: string,
  updater: (workflow: WorkflowDefinition) => WorkflowDefinition,
): WorkflowDefinition | undefined {
  const workflows = getAllWorkflows();
  const index = workflows.findIndex((w) => w.id === id);
  if (index === -1) return undefined;
  const updated = updater(workflows[index]);
  writeWorkflows(workflows.map((w, i) => (i === index ? updated : w)));
  return updated;
}

export function enableWorkflow(id: string): WorkflowDefinition | undefined {
  return updateWorkflowRecord(id, (w) => ({ ...w, status: "enabled", updatedAt: new Date().toISOString() }));
}

export function disableWorkflow(id: string): WorkflowDefinition | undefined {
  return updateWorkflowRecord(id, (w) => ({ ...w, status: "disabled", updatedAt: new Date().toISOString() }));
}

/** Bumps version + updatedAt — the registry's "Version" capability. */
export function updateWorkflow(
  id: string,
  patch: Partial<Pick<WorkflowDefinition, "name" | "description" | "steps" | "priority" | "metadata">>,
): WorkflowDefinition | undefined {
  return updateWorkflowRecord(id, (w) => ({
    ...w,
    ...patch,
    version: w.version + 1,
    updatedAt: new Date().toISOString(),
  }));
}

/** Clones as disabled by default — two active workflows on the same
 * trigger would otherwise double every side effect the clone shares with
 * its source. */
export function cloneWorkflow(id: string, now: Date = new Date()): WorkflowDefinition | undefined {
  const source = getWorkflowById(id);
  if (!source) return undefined;
  const cloned: WorkflowDefinition = {
    ...source,
    id: `${source.id}:clone:${crypto.randomUUID()}`,
    name: `${source.name} (Copy)`,
    status: "disabled",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastRun: null,
    executionHistory: [],
    version: 1,
  };
  writeWorkflows([...getAllWorkflows(), cloned]);
  return cloned;
}

export function deleteWorkflow(id: string): void {
  writeWorkflows(getAllWorkflows().filter((w) => w.id !== id));
}

/** Called by lib/workflows/runner.ts after a run completes — updates the
 * definition's lastRun and appends to its capped embedded history (the
 * full, uncapped log lives in lib/workflows/history.ts). */
export function recordExecution(
  id: string,
  summary: WorkflowExecutionSummary,
): WorkflowDefinition | undefined {
  return updateWorkflowRecord(id, (w) => ({
    ...w,
    lastRun: summary,
    executionHistory: [summary, ...w.executionHistory].slice(0, MAX_EMBEDDED_HISTORY),
    updatedAt: summary.completedAt ?? summary.startedAt,
  }));
}

export function clearWorkflows(): void {
  writeWorkflows([]);
}
