/**
 * Recommendation Repository — Postgres-backed persistence for
 * lib/decision/storage.ts's successor. lib/decision/engine.ts::
 * generateRecommendations is pure and unchanged — it always recomputes
 * the full candidate set fresh (no DB read), with a deterministic id per
 * recommendation (e.g. `budget-reduce:${budgetId}:${monthKey}`, scoped to
 * the current month so a dismissed recommendation naturally reappears if
 * the same situation recurs later).
 *
 * Unlike the old localStorage version (a small id -> {status, createdAt}
 * overlay map merged onto the freshly generated array at read time), this
 * repository stores full Recommendation rows and upserts them by
 * deterministic id on every regeneration — same net effect (status and
 * original createdAt survive regeneration), same upsert-preserving
 * pattern already used for Feed/Connection Hub, but fitting the schema's
 * full-row Recommendation model instead of a separate overlay table.
 */
import { prisma } from "@/lib/db/prisma";
import type {
  Recommendation as PrismaRecommendation,
  RecommendationCategory as PrismaRecommendationCategory,
  RecommendationPriority as PrismaRecommendationPriority,
  RecommendationStatus as PrismaRecommendationStatus,
} from "@/src/generated/prisma/client";
import type {
  Recommendation,
  RecommendationCategory,
  RecommendationPriority,
  RecommendationStatus,
} from "@/types/recommendation";

const PRIORITY_TO_DB: Record<RecommendationPriority, PrismaRecommendationPriority> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};
const PRIORITY_FROM_DB: Record<PrismaRecommendationPriority, RecommendationPriority> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

const CATEGORY_TO_DB: Record<RecommendationCategory, PrismaRecommendationCategory> = {
  Budget: "BUDGET",
  Savings: "SAVINGS",
  Subscriptions: "SUBSCRIPTIONS",
  Spending: "SPENDING",
  Income: "INCOME",
  Habits: "HABITS",
  Forecast: "FORECAST",
  General: "GENERAL",
};
const CATEGORY_FROM_DB: Record<PrismaRecommendationCategory, RecommendationCategory> = {
  BUDGET: "Budget",
  SAVINGS: "Savings",
  SUBSCRIPTIONS: "Subscriptions",
  SPENDING: "Spending",
  INCOME: "Income",
  HABITS: "Habits",
  FORECAST: "Forecast",
  GENERAL: "General",
};

// The app only ever writes "dismissed" or "completed" (see
// lib/decision/storage.ts::dismissRecommendation/completeRecommendation);
// "new" is the default state for a freshly upserted row, and EXPIRED is
// reserved for a future scheduled-cleanup job, not written today.
const STATUS_TO_DB: Record<RecommendationStatus, PrismaRecommendationStatus> = {
  new: "PENDING",
  dismissed: "DISMISSED",
  completed: "ACCEPTED",
};
const STATUS_FROM_DB: Record<PrismaRecommendationStatus, RecommendationStatus> = {
  PENDING: "new",
  DISMISSED: "dismissed",
  ACCEPTED: "completed",
  EXPIRED: "dismissed",
};

function toRecommendation(row: PrismaRecommendation): Recommendation {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: PRIORITY_FROM_DB[row.priority],
    category: CATEGORY_FROM_DB[row.category],
    reason: row.reason,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    status: STATUS_FROM_DB[row.status],
  };
}

export async function listRecommendations(organizationId: string): Promise<Recommendation[]> {
  const rows = await prisma.recommendation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRecommendation);
}

/** Upserts each freshly generated recommendation by its deterministic id,
 * preserving status and createdAt on rows that already exist (mirrors
 * lib/decision/storage.ts::applyPersistedStatus's merge semantics) while
 * refreshing every other field to the latest computed values. Rows that
 * regenerate every run stay in sync automatically; rows no longer
 * produced by generateRecommendations() are simply not touched (parity
 * with the old status-overlay map, which never pruned stale entries
 * either). */
export async function reconcileRecommendations(
  organizationId: string,
  freshRecommendations: Recommendation[],
): Promise<Recommendation[]> {
  return prisma.$transaction(async (tx) => {
    const existingRows = await tx.recommendation.findMany({
      where: { organizationId, id: { in: freshRecommendations.map((r) => r.id) } },
    });
    const existingById = new Map(existingRows.map((r) => [r.id, r]));

    const results: Recommendation[] = [];
    for (const fresh of freshRecommendations) {
      const existing = existingById.get(fresh.id);
      const data = {
        organizationId,
        title: fresh.title,
        description: fresh.description,
        reason: fresh.reason,
        action: fresh.action,
        priority: PRIORITY_TO_DB[fresh.priority],
        category: CATEGORY_TO_DB[fresh.category],
      };
      const row = existing
        ? await tx.recommendation.update({ where: { id: fresh.id }, data })
        : await tx.recommendation.create({
            data: { id: fresh.id, ...data, status: STATUS_TO_DB.new },
          });
      results.push(toRecommendation(row));
    }
    return results;
  });
}

export async function dismissRecommendation(organizationId: string, id: string): Promise<void> {
  await prisma.recommendation.updateMany({
    where: { id, organizationId },
    data: { status: STATUS_TO_DB.dismissed },
  });
}

export async function completeRecommendation(organizationId: string, id: string): Promise<void> {
  await prisma.recommendation.updateMany({
    where: { id, organizationId },
    data: { status: STATUS_TO_DB.completed },
  });
}
