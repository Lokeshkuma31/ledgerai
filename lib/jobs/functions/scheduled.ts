/**
 * Cron-triggered, per-organization fan-out jobs — recurring detection,
 * forecast refresh, budget recalculation, analytics aggregation,
 * recommendation generation. See docs/job-platform/06-scheduling-strategy.md
 * §6.2. Each loops over active orgs with one step.run() per org (so a
 * crash mid-run resumes from the next org, not the start — Inngest's own
 * step memoization, not custom checkpoint code) and continues past a
 * single org's failure rather than aborting the whole run.
 */
import { registerSchedule } from "@/lib/jobs/scheduler";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey, dayBucket } from "@/lib/jobs/idempotency";
import { serializeError } from "@/lib/jobs/retry";
import { listActiveOrganizationIds } from "@/services/organizations/organization-service";
import { listTransactions } from "@/services/transactions/transaction-service";
import { getAllMerchantProfiles } from "@/services/merchants/merchant-service";
import { detectAndReconcileRecurring } from "@/services/recurring/recurring-service";
import * as forecastService from "@/services/forecast/forecast-service";
import { getBudgetStatuses } from "@/services/budgets/budget-service";
import { listRecommendations, getRecommendations } from "@/services/decision/decision-service";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import type { RecurringTransaction } from "@/types/recurring";

/** Runs `work(organizationId)` for every active org, one step per org, and
 * reports per-org failures in the return value instead of throwing (a
 * bug in one org's data shouldn't dead-letter every other org's run). */
async function forEachOrg(
  step: { run: (id: string, fn: () => Promise<unknown>) => Promise<unknown> },
  jobName: string,
  work: (organizationId: string) => Promise<void>,
): Promise<{ processed: number; failed: { organizationId: string; error: unknown }[] }> {
  const orgIds = (await step.run("list-orgs", () => listActiveOrganizationIds())) as string[];
  const failed: { organizationId: string; error: unknown }[] = [];
  let processed = 0;

  for (const organizationId of orgIds) {
    try {
      await step.run(`${jobName}-${organizationId}`, () => work(organizationId));
      processed += 1;
    } catch (error) {
      failed.push({ organizationId, error: serializeError(error) });
    }
  }
  return { processed, failed };
}

export const recurringDetect = registerSchedule(
  { id: "recurring-detect", name: "Recurring Detection", cron: "0 3 * * *" },
  async ({ correlationId, step }) => {
    return forEachOrg(step, "recurring", async (organizationId) => {
      const [transactions, merchantProfiles] = await Promise.all([
        listTransactions(organizationId),
        getAllMerchantProfiles(organizationId),
      ]);
      const reconciliation = await detectAndReconcileRecurring(organizationId, transactions, merchantProfiles);
      const newlyDetected: RecurringTransaction[] = reconciliation.newlyDetected ?? [];
      for (const item of newlyDetected) {
        await dispatch(
          "ledger/recurring.detected",
          { organizationId, correlationId, recurringTransactionId: item.id, merchantId: item.merchantId ?? null, status: item.status },
          { id: buildKey("recurring-detected", item.id, dayBucket()) },
        );
      }
    });
  },
);

export const forecastRefresh = registerSchedule(
  { id: "forecast-refresh", name: "Forecast Refresh", cron: "0 4 * * *" },
  async ({ correlationId, step }) => {
    return forEachOrg(step, "forecast", async (organizationId) => {
      const now = new Date();
      const { snapshot } = await forecastService.refreshForecast(organizationId, new Date(dayBucket(now)), now);
      await dispatch(
        "ledger/forecast.updated",
        { organizationId, correlationId, forecastSnapshotId: snapshot.id, generatedAtDate: dayBucket(now) },
        { id: buildKey("forecast-updated", organizationId, dayBucket(now)) },
      );
    });
  },
);

export const budgetRecalculate = registerSchedule(
  { id: "budget-recalculate", name: "Budget Recalculation", cron: "0 4 * * *" },
  async ({ correlationId, step }) => {
    return forEachOrg(step, "budget", async (organizationId) => {
      const statuses = await getBudgetStatuses(organizationId);
      for (const status of statuses) {
        await dispatch(
          "ledger/budget.updated",
          { organizationId, correlationId, budgetId: status.id, categoryId: status.category, status: status.status },
          { id: buildKey("budget-updated", status.id, dayBucket()) },
        );
      }
    });
  },
);

/** Analytics aggregation — event contract + orchestration shell only.
 * See docs/job-platform/09-migration-plan.md: the /analytics page's exact
 * aggregation data source wasn't in scope of this platform's service
 * inventory, so this dispatches the completion event downstream jobs
 * (feed-generate) depend on without recomputing analytics itself yet. */
export const analyticsRefresh = registerSchedule(
  { id: "analytics-refresh", name: "Analytics Aggregation", cron: "0 5 * * *" },
  async ({ correlationId, step }) => {
    return forEachOrg(step, "analytics", async (organizationId) => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = now.toISOString();
      await dispatch(
        "ledger/analytics.aggregated",
        { organizationId, correlationId, periodStart, periodEnd, aggregateIds: [] },
        { id: buildKey("analytics-aggregated", organizationId, dayBucket(now)) },
      );
    });
  },
);

export const recommendationGenerate = registerSchedule(
  { id: "recommendation-generate", name: "Recommendation Generation", cron: "0 6 * * *" },
  async ({ correlationId, step }) => {
    return forEachOrg(step, "recommendation", async (organizationId) => {
      const now = new Date();
      const [transactions, budgetsForCategories] = await Promise.all([
        listTransactions(organizationId),
        getBudgetStatuses(organizationId, now),
      ]);
      const insights = generateInsights(transactions);
      const timeline = generateTimeline(transactions, now);
      const before = await listRecommendations(organizationId);
      const beforeIds = new Set(before.map((r) => r.id));

      const fresh = await getRecommendations(organizationId, {
        transactions,
        budgets: budgetsForCategories.map((b) => ({
          id: b.id,
          category: b.category,
          monthlyLimit: b.monthlyLimit,
          createdAt: now.toISOString(),
        })),
        events: [],
        insights,
        timeline,
        now,
      });

      for (const rec of fresh) {
        if (beforeIds.has(rec.id)) continue; // only dispatch genuinely new recommendations
        await dispatch(
          "ledger/recommendation.generated",
          { organizationId, correlationId, recommendationId: rec.id },
          { id: buildKey("recommendation-generated", rec.id) },
        );
      }
    });
  },
);
