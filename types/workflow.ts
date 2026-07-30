export const WORKFLOW_TRIGGERS = [
  "transaction-imported",
  "transaction-created",
  "transaction-reviewed",
  "budget-updated",
  "budget-exceeded",
  "forecast-updated",
  "recurring-transaction-detected",
  "merchant-added",
  "recommendation-generated",
  "financial-event-created",
  "feed-updated",
  "daily-refresh",
  "manual-run",
  "consent-granted",
  "account-connected",
  "sync-completed",
  "sync-failed",
  "sync-large-import",
  "sync-duplicate-detected",
  "sync-provider-reconnected",
  "disconnect",
  "connection-token-refreshed",
  "connection-failed",
  "connection-permission-revoked",
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

/** Every engine a workflow step can address. This coordinates existing
 * engines — it never reimplements one, and every handler in
 * lib/workflows/step.ts calls straight through to the real engine
 * function for its (engine, action) pair. */
export const WORKFLOW_ENGINES = [
  "import",
  "merchant",
  "classifier",
  "memory",
  "timeline",
  "insights",
  "budget",
  "events",
  "decision",
  "recurring",
  "forecast",
  "feed",
  "policy",
  "explanation",
  "query",
  "semantic-index",
  "coach",
  "orchestrator",
] as const;
export type WorkflowEngine = (typeof WORKFLOW_ENGINES)[number];

export const WORKFLOW_STEP_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "retrying",
] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const WORKFLOW_RUN_STATUSES = ["running", "completed", "failed", "partial"] as const;
export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_DEFINITION_STATUSES = ["enabled", "disabled"] as const;
export type WorkflowDefinitionStatus = (typeof WORKFLOW_DEFINITION_STATUSES)[number];

/** A reusable step template within a WorkflowDefinition — static, not tied
 * to any particular run. lib/workflows/step.ts owns turning (engine,
 * action) into an actual handler function at execution time. */
export interface WorkflowStepDefinition {
  id: string;
  engine: WorkflowEngine;
  action: string;
  /** Human-readable label for the timeline visualization, e.g. "Merchant Intelligence". */
  label: string;
}

/** One step's outcome within a specific run — this is the shape the spec's
 * "Workflow Step" section describes (status/timing/error/retry included). */
export interface WorkflowStepResult {
  id: string;
  engine: WorkflowEngine;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: WorkflowStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  /** Milliseconds. */
  duration: number | null;
  error: string | null;
  retryCount: number;
}

/** The compact record a WorkflowDefinition keeps of its own recent runs —
 * lib/workflows/history.ts holds the full WorkflowRun (with per-step
 * detail) separately. */
export interface WorkflowExecutionSummary {
  runId: string;
  trigger: WorkflowTrigger;
  status: WorkflowRunStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  successfulSteps: number;
  failedSteps: number;
  retryCount: number;
}

/**
 * A reusable, traceable financial business process — coordinates existing
 * engines through a fixed sequence of steps in response to a trigger. The
 * Workflow Engine never replaces an engine's own logic; it only sequences
 * calls into it, the same way lib/intelligence/orchestrator.ts already
 * sequences engine calls for building FinancialState.
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStepDefinition[];
  status: WorkflowDefinitionStatus;
  /** 0-100 — deterministic ordering when multiple workflows share a trigger. */
  priority: number;
  createdAt: string;
  updatedAt: string;
  lastRun: WorkflowExecutionSummary | null;
  /** Capped to the most recent N runs (see lib/workflows/registry.ts) —
   * the full, uncapped log lives in lib/workflows/history.ts. */
  executionHistory: WorkflowExecutionSummary[];
  metadata: Record<string, unknown>;
  /** Bumped by registry.ts's cloneWorkflow/updateWorkflow — satisfies the
   * registry's "Version" capability without a separate versions table. */
  version: number;
}

/**
 * One full execution record — what lib/workflows/history.ts persists.
 * More detailed than WorkflowExecutionSummary (keeps every step's result).
 */
export interface WorkflowRun {
  runId: string;
  workflowId: string;
  workflowName: string;
  trigger: WorkflowTrigger;
  status: WorkflowRunStatus;
  steps: WorkflowStepResult[];
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  successfulSteps: number;
  failedSteps: number;
  retryCount: number;
  /** Free-form context passed to step handlers and echoed back here for
   * debugging/audit — e.g. which budget/category triggered this run. */
  context: Record<string, unknown>;
}

export interface WorkflowStatistics {
  totalWorkflows: number;
  activeWorkflows: number;
  averageRuntimeMs: number;
  /** 0-1. */
  successRate: number;
  mostTriggeredWorkflow: string | null;
  /** By average duration. */
  mostExpensiveWorkflow: string | null;
  failedRuns: number;
  retries: number;
}

/** What the AI Financial Coach receives — already-executed workflow runs.
 * The Coach summarizes/explains these; it never triggers or decides a
 * workflow itself. */
export interface WorkflowCoachSummary {
  name: string;
  trigger: WorkflowTrigger;
  status: WorkflowRunStatus;
  stepCount: number;
  durationMs: number | null;
}
