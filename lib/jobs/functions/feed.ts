/**
 * Feed generation job — fans in from several upstream completion events
 * (docs/job-platform/03-job-dependency-graph.md). Orchestrates
 * lib/feed/engine.ts::generateFeed (unchanged) and persists via
 * services/feed/feed-service.ts::reconcileFeedItems, which upserts by
 * FeedItem's own [organizationId, key] — the canonical idempotency
 * pattern this whole platform's other "no natural key" cases were modeled
 * after (docs/job-platform/07-idempotency-design.md).
 *
 * Known scope limits, documented rather than silently wrong: `events`
 * (FinancialEvent[]) is passed empty — no Postgres-backed financial-event
 * repository exists yet (see docs/job-platform/09-migration-plan.md);
 * generateFeed's own internal getAllFeedItems() lookback (for "Budget
 * Recovered" cross-run comparison) reads a window-guarded legacy registry
 * that always returns empty server-side — a pre-existing characteristic
 * of that engine, not something this job introduces or can fix without
 * editing it (out of scope — business engines stay unchanged).
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey, dayBucket } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { generateFeed } from "@/lib/feed/engine";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import { computeForecastStatistics } from "@/lib/forecast/statistics";
import { listTransactions } from "@/services/transactions/transaction-service";
import { getBudgetStatuses } from "@/services/budgets/budget-service";
import { listRecurring } from "@/services/recurring/recurring-service";
import { listRecommendations } from "@/services/decision/decision-service";
import { getAllMerchantProfiles } from "@/services/merchants/merchant-service";
import * as forecastService from "@/services/forecast/forecast-service";
import * as feedService from "@/services/feed/feed-service";
import type { EventPayload } from "@/lib/jobs/events";

type Trigger =
  | EventPayload<"ledger/transaction.classified">
  | EventPayload<"ledger/workflow.completed">
  | EventPayload<"ledger/budget.updated">
  | EventPayload<"ledger/forecast.updated">
  | EventPayload<"ledger/recurring.detected">
  | EventPayload<"ledger/analytics.aggregated">
  | EventPayload<"ledger/recommendation.generated">;

export const feedGenerate = defineJob<Trigger>(
  {
    id: "feed-generate",
    name: "Feed Generation",
    trigger: [
      { event: "ledger/transaction.classified" },
      { event: "ledger/workflow.completed" },
      { event: "ledger/budget.updated" },
      { event: "ledger/forecast.updated" },
      { event: "ledger/recurring.detected" },
      { event: "ledger/analytics.aggregated" },
      { event: "ledger/recommendation.generated" },
    ],
    concurrency: [orgConcurrency(5), globalConcurrency(40)],
  },
  async ({ organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };
    const now = new Date();

    const [transactions, budgetStatuses, recurring, recommendations, merchantProfiles] = await step.run(
      "load-context",
      () =>
        Promise.all([
          listTransactions(organizationId),
          getBudgetStatuses(organizationId, now),
          listRecurring(organizationId),
          listRecommendations(organizationId),
          getAllMerchantProfiles(organizationId),
        ]),
    );

    const { forecast } = await step.run("refresh-forecast", () =>
      forecastService.refreshForecast(organizationId, new Date(dayBucket(now)), now),
    );

    const items = await step.run("generate", () => {
      const insights = generateInsights(transactions);
      const timeline = generateTimeline(transactions, now);
      const forecastStatistics = computeForecastStatistics(forecast, transactions, now);
      return generateFeed({
        transactions,
        budgetStatuses,
        events: [],
        recommendations,
        recurring,
        forecast,
        forecastStatistics,
        merchantProfiles,
        insights,
        timeline,
      });
    });

    const reconciled = (await step.run("persist", () =>
      feedService.reconcileFeedItems(organizationId, items),
    )) as Awaited<ReturnType<typeof feedService.reconcileFeedItems>>;

    await dispatch(
      "ledger/feed.generated",
      { organizationId, correlationId, feedItemKeys: reconciled.map((i) => i.id) },
      { id: buildKey("feed-generated", organizationId, correlationId) },
    );

    return { itemCount: reconciled.length };
  },
);
