/**
 * Forecast Repository — Postgres persistence for ForecastSnapshot. Did
 * not exist before the job platform: lib/forecast/engine.ts is a pure
 * calculation engine with no persistence of its own (the schema's own
 * comment anticipated a repository here, but nothing had written one
 * yet — see docs/job-platform/09-migration-plan.md's Forecast refresh
 * row). Mirrors the repositories/+services/ split every other domain uses.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type { CashFlowForecast } from "@/types/forecast";

export interface ForecastSnapshotRecord {
  id: string;
  organizationId: string;
  generatedAt: string;
  payload: CashFlowForecast;
  createdAt: string;
}

/** Upserts on [organizationId, generatedAt] — `generatedAt` is always a
 * day-truncated Date (see lib/jobs/idempotency.ts::dayBucket), so a
 * same-day re-run converges to the same row instead of creating a second
 * snapshot for that day. See docs/job-platform/07-idempotency-design.md's
 * Forecast Snapshots section. */
export async function upsertSnapshot(
  organizationId: string,
  generatedAtDay: Date,
  payload: CashFlowForecast,
): Promise<ForecastSnapshotRecord> {
  const row = await prisma.forecastSnapshot.upsert({
    where: { organizationId_generatedAt: { organizationId, generatedAt: generatedAtDay } },
    create: { organizationId, generatedAt: generatedAtDay, payload: payload as unknown as Prisma.InputJsonValue },
    update: { payload: payload as unknown as Prisma.InputJsonValue },
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    generatedAt: row.generatedAt.toISOString(),
    payload: row.payload as unknown as CashFlowForecast,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getLatestSnapshot(organizationId: string): Promise<ForecastSnapshotRecord | undefined> {
  const row = await prisma.forecastSnapshot.findFirst({
    where: { organizationId },
    orderBy: { generatedAt: "desc" },
  });
  if (!row) return undefined;
  return {
    id: row.id,
    organizationId: row.organizationId,
    generatedAt: row.generatedAt.toISOString(),
    payload: row.payload as unknown as CashFlowForecast,
    createdAt: row.createdAt.toISOString(),
  };
}
