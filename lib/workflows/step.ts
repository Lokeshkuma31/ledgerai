import { calculateBudgetStatus } from "@/lib/budget/engine";
import { generateRecommendations } from "@/lib/decision/engine";
import { applyPersistedStatus } from "@/lib/decision/storage";
import { explainAll } from "@/lib/explanations/engine";
import { detectFinancialEvents } from "@/lib/events/engine";
import { generateFeed, type GenerateFeedInput } from "@/lib/feed/engine";
import { generateForecast } from "@/lib/forecast/engine";
import { buildFinancialIndex } from "@/lib/index";
import { generateInsights, type Insights } from "@/lib/insights/engine";
import { evaluateNotificationPolicy } from "@/lib/policy/engine";
import { detectRecurringTransactions } from "@/lib/recurring/engine";
import type { RecurringReconciliation } from "@/lib/recurring/registry";
import { generateTimeline, type TimelineGroup } from "@/lib/timeline/engine";
import type { Budget, BudgetStatus } from "@/types/budget";
import type { ExplanationContext } from "@/types/explanation";
import type { FinancialEvent } from "@/types/event";
import type { FeedItem } from "@/types/feed";
import type { CashFlowForecast, ForecastStatistics } from "@/types/forecast";
import type { FinancialIndexSources } from "@/types/index";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { NotificationPreferences } from "@/types/policy";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";
import type { WorkflowEngine } from "@/types/workflow";

/**
 * The shared bag of data a workflow run threads through every step —
 * populated by whatever fired the trigger (see lib/workflows/runner.ts).
 * Loosely typed by design: different triggers populate different keys,
 * the same way a plugin system would.
 */
export type StepContext = Record<string, unknown>;

export type StepHandler = (
  context: StepContext,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

function arr<T>(context: StepContext, key: string): T[] {
  const value = context[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function obj<T>(context: StepContext, key: string, fallback: T): T {
  const value = context[key];
  return value !== undefined ? (value as T) : fallback;
}

function emptyInsights(): Insights {
  return {
    totalSpent: 0,
    totalTransactions: 0,
    averageExpense: 0,
    largestExpense: 0,
    smallestExpense: 0,
    topCategory: null,
    topPaymentMethod: null,
    categoryBreakdown: [],
  };
}

// --- handlers: reactive chain (Budget Exceeded example) -----------------

async function handleEventsDetect(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const budgetStatuses = arr<BudgetStatus>(context, "budgetStatuses");
  const recurring = context.recurringReconciliation as RecurringReconciliation | undefined;
  const forecast = context.forecast as CashFlowForecast | undefined;
  const forecastStatistics = context.forecastStatistics as ForecastStatistics | undefined;
  const now = obj<Date>(context, "now", new Date());

  const events = detectFinancialEvents(transactions, {
    budgetStatuses,
    recurring,
    forecast: forecast && forecastStatistics ? { forecast, statistics: forecastStatistics } : undefined,
    now,
  });
  return { eventCount: events.length, eventIds: events.map((e) => e.id) };
}

async function handleDecisionGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const budgets = arr<Budget>(context, "budgets");
  const events = arr<FinancialEvent>(context, "events");
  const insights = obj<Insights>(context, "insights", emptyInsights());
  const timeline = arr<TimelineGroup>(context, "timeline");
  const now = obj<Date>(context, "now", new Date());

  const recommendations = applyPersistedStatus(
    generateRecommendations({ transactions, budgets, events, insights, timeline, now }),
  );
  return { recommendationCount: recommendations.length };
}

async function handleExplanationGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const explanationContext = context.explanationContext as ExplanationContext | undefined;
  if (!explanationContext) return { explanationCount: 0 };
  const explanations = explainAll(explanationContext);
  return { explanationCount: explanations.length };
}

async function handleFeedGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const input = context.feedInput as GenerateFeedInput | undefined;
  if (!input) return { feedItemCount: 0 };
  const feed = generateFeed(input);
  return { feedItemCount: feed.length };
}

async function handlePolicyEvaluate(context: StepContext): Promise<Record<string, unknown>> {
  const feed = arr<FeedItem>(context, "feed");
  const preferences = context.preferences as NotificationPreferences | undefined;
  if (!preferences || feed.length === 0) return { candidateCount: 0, notifyCount: 0 };
  const now = obj<Date>(context, "now", new Date());
  const candidates = evaluateNotificationPolicy({ feed, preferences, now });
  return {
    candidateCount: candidates.length,
    notifyCount: candidates.filter((c) => c.policyDecision === "notify-immediately").length,
  };
}

async function handleSemanticIndexRefresh(context: StepContext): Promise<Record<string, unknown>> {
  const sources = context.indexSources as FinancialIndexSources | undefined;
  if (!sources) return { objectCount: 0 };
  const index = buildFinancialIndex(sources);
  return { objectCount: index.objects.length };
}

/** Deliberately does not call the LLM — the Coach already regenerates its
 * own summary once per orchestrator run, with its own signature-based
 * cache. This step only records that this workflow touched data the Coach
 * cares about, for traceability. */
async function handleCoachAcknowledge(): Promise<Record<string, unknown>> {
  return { acknowledged: true };
}

// --- handlers: transaction-imported visualization -----------------------

async function handleImportAcknowledge(context: StepContext): Promise<Record<string, unknown>> {
  const transaction = context.transaction as Transaction | undefined;
  return { transactionId: transaction?.id ?? null, amount: transaction?.amount ?? null };
}

/** Merchant identification already ran synchronously inside
 * lib/ingestion/pipeline.ts's ingestTransaction — this step only reports
 * what it decided, it never re-runs identifyMerchant itself. */
async function handleMerchantAcknowledge(context: StepContext): Promise<Record<string, unknown>> {
  const transaction = context.transaction as Transaction | undefined;
  return {
    merchantId: transaction?.merchantId ?? null,
    merchantName: transaction?.merchantName ?? null,
    merchantConfidence: transaction?.merchantConfidence ?? null,
  };
}

/** Classification already ran synchronously during ingestion — reports
 * the transaction's own aiCategory/confidence rather than re-classifying. */
async function handleClassifierAcknowledge(context: StepContext): Promise<Record<string, unknown>> {
  const transaction = context.transaction as Transaction | undefined;
  return {
    category: transaction?.aiCategory ?? null,
    confidence: transaction?.confidence ?? null,
    classificationSource: transaction?.classificationSource ?? null,
  };
}

async function handleMemoryAcknowledge(context: StepContext): Promise<Record<string, unknown>> {
  const transaction = context.transaction as Transaction | undefined;
  return { usedMemory: transaction?.classificationSource === "memory" };
}

async function handleRecurringDetect(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const merchantProfiles = arr<MerchantProfile>(context, "merchantProfiles");
  const now = obj<Date>(context, "now", new Date());
  const reconciliation = detectRecurringTransactions(transactions, merchantProfiles, now);
  return { recurringCount: reconciliation.items.length, newlyDetected: reconciliation.newlyDetected.length };
}

async function handleForecastGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const recurring = arr<RecurringTransaction>(context, "recurring");
  const budgetStatuses = arr<BudgetStatus>(context, "budgetStatuses");
  const insights = obj<Insights>(context, "insights", emptyInsights());
  const timeline = arr<TimelineGroup>(context, "timeline");
  const now = obj<Date>(context, "now", new Date());
  const forecast = generateForecast(transactions, recurring, budgetStatuses, insights, timeline, now);
  return {
    projectedEndOfMonthBalance: forecast.projectedEndOfMonthBalance,
    confidence: forecast.confidence,
  };
}

async function handleTimelineGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const now = obj<Date>(context, "now", new Date());
  const timeline = generateTimeline(transactions, now);
  return { groupCount: timeline.length };
}

async function handleInsightsGenerate(context: StepContext): Promise<Record<string, unknown>> {
  const transactions = arr<Transaction>(context, "transactions");
  const insights = generateInsights(transactions);
  return { totalSpent: insights.totalSpent, totalTransactions: insights.totalTransactions };
}

async function handleBudgetCalculate(context: StepContext): Promise<Record<string, unknown>> {
  const budgets = arr<Budget>(context, "budgets");
  const transactions = arr<Transaction>(context, "transactions");
  const now = obj<Date>(context, "now", new Date());
  const statuses = calculateBudgetStatus(budgets, transactions, now);
  return {
    exceededCount: statuses.filter((s) => s.status === "exceeded").length,
    warningCount: statuses.filter((s) => s.status === "warning").length,
  };
}

// --- registry ------------------------------------------------------------

const HANDLERS = new Map<string, StepHandler>();

function key(engine: WorkflowEngine, action: string): string {
  return `${engine}:${action}`;
}

/** Lets new engines/actions register a handler without touching this file
 * — the extensibility point "plugin-defined workflows" will eventually use. */
export function registerStepHandler(engine: WorkflowEngine, action: string, handler: StepHandler): void {
  HANDLERS.set(key(engine, action), handler);
}

export function getStepHandler(engine: WorkflowEngine, action: string): StepHandler | undefined {
  return HANDLERS.get(key(engine, action));
}

registerStepHandler("import", "acknowledgeImport", handleImportAcknowledge);
registerStepHandler("merchant", "acknowledgeMerchant", handleMerchantAcknowledge);
registerStepHandler("classifier", "acknowledgeClassification", handleClassifierAcknowledge);
registerStepHandler("memory", "acknowledgeMemory", handleMemoryAcknowledge);
registerStepHandler("recurring", "detectRecurring", handleRecurringDetect);
registerStepHandler("forecast", "generateForecast", handleForecastGenerate);
registerStepHandler("timeline", "generateTimeline", handleTimelineGenerate);
registerStepHandler("insights", "generateInsights", handleInsightsGenerate);
registerStepHandler("budget", "calculateBudgetStatus", handleBudgetCalculate);
registerStepHandler("events", "detectFinancialEvent", handleEventsDetect);
registerStepHandler("decision", "generateRecommendation", handleDecisionGenerate);
registerStepHandler("explanation", "generateExplanation", handleExplanationGenerate);
registerStepHandler("feed", "createFeedItem", handleFeedGenerate);
registerStepHandler("policy", "generateNotificationCandidate", handlePolicyEvaluate);
registerStepHandler("semantic-index", "refreshIndex", handleSemanticIndexRefresh);
registerStepHandler("coach", "notifyCoach", handleCoachAcknowledge);
