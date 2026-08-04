/**
 * Recurring Repository — Postgres-backed persistence for
 * lib/recurring/registry.ts's successor. lib/recurring/{matcher,predictor,
 * statistics}.ts stay pure and unchanged.
 *
 * RecurringTransaction.id is a deterministic groupKey (see
 * lib/recurring/engine.ts's `id: candidate.groupKey`), stable across
 * detection runs for the same merchant/title group — the same
 * upsert-by-deterministic-id pattern used for Feed/Workflow, so it's used
 * directly as the Prisma row id (create-or-update, like Connection Hub's
 * upsertStoredConnection).
 *
 * relatedTransactionIds is a real join table here (RecurringTransactionTransaction)
 * rather than a Postgres array, per the migration plan's schema decision —
 * reconcileRecurring below syncs it to match each fresh item's set exactly.
 *
 * Manual pause/resume is a RecurringOverride row (field="status"), the
 * relational successor to the old ledgerai:recurring:overrides localStorage
 * map — reconcileRecurring re-applies it over whatever the fresh detection
 * computed, exactly as before.
 */
import { prisma } from "@/lib/db/prisma";
import type {
  RecurringOverride,
  RecurringTransaction as PrismaRecurringTransaction,
  RecurringFrequency as PrismaRecurringFrequency,
  RecurringStatus as PrismaRecurringStatus,
} from "@/src/generated/prisma/client";
import type {
  RecurringFrequency,
  RecurringStatus,
  RecurringTransaction,
} from "@/types/recurring";

const FREQUENCY_TO_DB: Record<RecurringFrequency, PrismaRecurringFrequency> = {
  Daily: "DAILY",
  Weekly: "WEEKLY",
  Biweekly: "BIWEEKLY",
  Monthly: "MONTHLY",
  Quarterly: "QUARTERLY",
  Yearly: "YEARLY",
  Unknown: "UNKNOWN",
};
const FREQUENCY_FROM_DB: Record<PrismaRecurringFrequency, RecurringFrequency> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  UNKNOWN: "Unknown",
};

const STATUS_TO_DB: Record<RecurringStatus, PrismaRecurringStatus> = {
  Active: "ACTIVE",
  Upcoming: "UPCOMING",
  Missed: "MISSED",
  Paused: "PAUSED",
  Stopped: "STOPPED",
};
const STATUS_FROM_DB: Record<PrismaRecurringStatus, RecurringStatus> = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  MISSED: "Missed",
  PAUSED: "Paused",
  STOPPED: "Stopped",
};

type ManualOverrideStatus = Extract<RecurringStatus, "Paused" | "Stopped">;
const AMOUNT_CHANGE_TOLERANCE = 0.15;
const OVERRIDE_FIELD_STATUS = "status";

type RecurringRow = PrismaRecurringTransaction & {
  relatedTx: { transactionId: string }[];
};

function toRecurring(row: RecurringRow): RecurringTransaction {
  return {
    id: row.id,
    merchantId: row.merchantId ?? undefined,
    merchantName: row.merchantName ?? undefined,
    title: row.title,
    category: row.category,
    frequency: FREQUENCY_FROM_DB[row.frequency],
    averageAmount: row.averageAmount.toNumber(),
    minimumAmount: row.minAmount.toNumber(),
    maximumAmount: row.maxAmount.toNumber(),
    lastAmount: row.lastAmount.toNumber(),
    lastOccurrence: row.lastOccurrence.toISOString().slice(0, 10),
    nextExpectedOccurrence: row.nextExpectedOccurrence
      ? row.nextExpectedOccurrence.toISOString().slice(0, 10)
      : null,
    daysRemaining: row.daysRemaining,
    confidence: row.confidence,
    transactionCount: row.transactionCount,
    isSubscription: row.isSubscription,
    isIncome: row.isIncome,
    isExpense: row.isExpense,
    status: STATUS_FROM_DB[row.status],
    relatedTransactionIds: row.relatedTx.map((t) => t.transactionId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeRelated = { relatedTx: { select: { transactionId: true } } };

export async function getAllRecurring(organizationId: string): Promise<RecurringTransaction[]> {
  const rows = await prisma.recurringTransaction.findMany({
    where: { organizationId },
    include: includeRelated,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRecurring);
}

export async function findRecurring(
  organizationId: string,
  id: string,
): Promise<RecurringTransaction | undefined> {
  const row = await prisma.recurringTransaction.findFirst({
    where: { id, organizationId },
    include: includeRelated,
  });
  return row ? toRecurring(row) : undefined;
}

export async function pauseRecurring(organizationId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.recurringOverride.deleteMany({ where: { recurringId: id, field: OVERRIDE_FIELD_STATUS } });
    await tx.recurringOverride.create({
      data: { recurringId: id, field: OVERRIDE_FIELD_STATUS, value: "Paused" },
    });
    await tx.recurringTransaction.updateMany({
      where: { id, organizationId },
      data: { status: "PAUSED" },
    });
  });
}

export async function resumeRecurring(organizationId: string, id: string): Promise<void> {
  await prisma.recurringOverride.deleteMany({
    where: { recurringId: id, field: OVERRIDE_FIELD_STATUS, recurring: { organizationId } },
  });
}

export interface RecurringReconciliation {
  items: RecurringTransaction[];
  newlyDetected: RecurringTransaction[];
  amountChanges: { item: RecurringTransaction; previousAmount: number }[];
}

async function getActiveStatusOverrides(
  organizationId: string,
): Promise<Map<string, ManualOverrideStatus>> {
  const rows = await prisma.recurringOverride.findMany({
    where: { field: OVERRIDE_FIELD_STATUS, recurring: { organizationId } },
  });
  return new Map(
    rows
      .filter((r): r is RecurringOverride & { value: ManualOverrideStatus } =>
        r.value === "Paused" || r.value === "Stopped",
      )
      .map((r) => [r.recurringId, r.value]),
  );
}

/** Persists a freshly-detected snapshot, mirroring
 * lib/recurring/registry.ts::reconcileRecurring's diff-against-previous
 * semantics (newlyDetected / amountChanges) exactly, plus syncing the
 * relatedTransactionIds join table and pruning overrides for ids no
 * longer present — all in one $transaction. */
export async function reconcileRecurring(
  organizationId: string,
  freshItems: RecurringTransaction[],
): Promise<RecurringReconciliation> {
  return prisma.$transaction(async (tx) => {
    const existingRows = await tx.recurringTransaction.findMany({
      where: { organizationId },
      include: includeRelated,
    });
    const previousById = new Map(existingRows.map((r) => [r.id, toRecurring(r)]));

    const overrideRows = await tx.recurringOverride.findMany({
      where: { field: OVERRIDE_FIELD_STATUS, recurring: { organizationId } },
    });
    const overrides = new Map(
      overrideRows
        .filter((r): r is RecurringOverride & { value: ManualOverrideStatus } =>
          r.value === "Paused" || r.value === "Stopped",
        )
        .map((r) => [r.recurringId, r.value]),
    );

    const newlyDetected: RecurringTransaction[] = [];
    const amountChanges: { item: RecurringTransaction; previousAmount: number }[] = [];
    const items: RecurringTransaction[] = [];

    for (const fresh of freshItems) {
      const existing = previousById.get(fresh.id);
      const status = overrides.get(fresh.id) ?? fresh.status;

      const data = {
        organizationId,
        merchantId: fresh.merchantId ?? null,
        merchantName: fresh.merchantName ?? null,
        title: fresh.title,
        category: fresh.category,
        frequency: FREQUENCY_TO_DB[fresh.frequency],
        averageAmount: fresh.averageAmount.toFixed(2),
        minAmount: fresh.minimumAmount.toFixed(2),
        maxAmount: fresh.maximumAmount.toFixed(2),
        lastAmount: fresh.lastAmount.toFixed(2),
        lastOccurrence: new Date(fresh.lastOccurrence),
        nextExpectedOccurrence: fresh.nextExpectedOccurrence
          ? new Date(fresh.nextExpectedOccurrence)
          : null,
        daysRemaining: fresh.daysRemaining,
        confidence: fresh.confidence,
        transactionCount: fresh.transactionCount,
        isSubscription: fresh.isSubscription,
        isIncome: fresh.isIncome,
        isExpense: fresh.isExpense,
        status: STATUS_TO_DB[status],
      };

      await tx.recurringTransaction.upsert({
        where: { id: fresh.id },
        create: { id: fresh.id, ...data },
        update: data,
      });

      // Sync the join table to fresh.relatedTransactionIds exactly.
      const currentLinks = existing
        ? new Set(existing.relatedTransactionIds)
        : new Set<string>();
      const targetLinks = new Set(fresh.relatedTransactionIds);
      const toRemove = [...currentLinks].filter((id) => !targetLinks.has(id));
      const toAdd = [...targetLinks].filter((id) => !currentLinks.has(id));
      if (toRemove.length > 0) {
        await tx.recurringTransactionTransaction.deleteMany({
          where: { recurringId: fresh.id, transactionId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.recurringTransactionTransaction.createMany({
          data: toAdd.map((transactionId) => ({ recurringId: fresh.id, transactionId })),
          skipDuplicates: true,
        });
      }

      const row = await tx.recurringTransaction.findUniqueOrThrow({
        where: { id: fresh.id },
        include: includeRelated,
      });
      const item = toRecurring(row);
      items.push(item);

      if (!existing) {
        newlyDetected.push(item);
      } else if (
        fresh.lastOccurrence > existing.lastOccurrence &&
        Math.abs(fresh.lastAmount - existing.lastAmount) >
          existing.averageAmount * AMOUNT_CHANGE_TOLERANCE
      ) {
        amountChanges.push({ item, previousAmount: existing.lastAmount });
      }
    }

    const survivingIds = new Set(items.map((i) => i.id));
    const staleOverrideRecurringIds = [...overrides.keys()].filter(
      (id) => !survivingIds.has(id),
    );
    if (staleOverrideRecurringIds.length > 0) {
      await tx.recurringOverride.deleteMany({
        where: { field: OVERRIDE_FIELD_STATUS, recurringId: { in: staleOverrideRecurringIds } },
      });
    }

    return { items, newlyDetected, amountChanges };
  });
}
