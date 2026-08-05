/**
 * Forecast Service — the async, Postgres-backed successor to running
 * lib/forecast/engine.ts::generateForecast on every read with nowhere to
 * persist it. lib/forecast/engine.ts is pure and unchanged; this service
 * is the one place a job joins it against real Transaction/Recurring/
 * Budget/Insights/Timeline data and persists the result.
 */
import { generateForecast } from "@/lib/forecast/engine";
import { generateInsights } from "@/lib/insights/engine";
import { generateTimeline } from "@/lib/timeline/engine";
import * as forecastRepository from "@/repositories/forecast-repository";
import type { ForecastSnapshotRecord } from "@/repositories/forecast-repository";
import { listTransactions } from "@/services/transactions/transaction-service";
import { getBudgetStatuses } from "@/services/budgets/budget-service";
import { listRecurring } from "@/services/recurring/recurring-service";
import type { CashFlowForecast } from "@/types/forecast";

export async function refreshForecast(
  organizationId: string,
  generatedAtDay: Date,
  now: Date = new Date(),
): Promise<{ snapshot: ForecastSnapshotRecord; forecast: CashFlowForecast }> {
  const [transactions, budgetStatuses, recurring] = await Promise.all([
    listTransactions(organizationId),
    getBudgetStatuses(organizationId, now),
    listRecurring(organizationId),
  ]);

  const insights = generateInsights(transactions);
  const timeline = generateTimeline(transactions, now);
  const forecast = generateForecast(transactions, recurring, budgetStatuses, insights, timeline, now);

  const snapshot = await forecastRepository.upsertSnapshot(organizationId, generatedAtDay, forecast);
  return { snapshot, forecast };
}

export async function getLatestForecast(organizationId: string): Promise<ForecastSnapshotRecord | undefined> {
  return forecastRepository.getLatestSnapshot(organizationId);
}
