/**
 * Recurring Service — the async, Postgres-backed successor to
 * lib/recurring/registry.ts. Reuses lib/recurring/engine.ts::
 * buildFreshRecurringItems (pure) for the actual detection rules, then
 * persists via repositories/recurring-repository.ts instead of
 * lib/recurring/registry.ts's localStorage path.
 */
import { buildFreshRecurringItems } from "@/lib/recurring/engine";
import * as recurringRepository from "@/repositories/recurring-repository";
import type { RecurringReconciliation } from "@/repositories/recurring-repository";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { RecurringTransaction } from "@/types/recurring";
import type { Transaction } from "@/types/transaction";

export async function listRecurring(organizationId: string): Promise<RecurringTransaction[]> {
  return recurringRepository.getAllRecurring(organizationId);
}

export async function findRecurring(
  organizationId: string,
  id: string,
): Promise<RecurringTransaction | undefined> {
  return recurringRepository.findRecurring(organizationId, id);
}

export async function pauseRecurring(organizationId: string, id: string): Promise<void> {
  return recurringRepository.pauseRecurring(organizationId, id);
}

export async function resumeRecurring(organizationId: string, id: string): Promise<void> {
  return recurringRepository.resumeRecurring(organizationId, id);
}

/** Mirrors lib/recurring/engine.ts::detectRecurringTransactions, but
 * against Postgres — same detection rules (buildFreshRecurringItems is
 * shared, unchanged), Postgres-backed reconciliation instead of
 * localStorage. */
export async function detectAndReconcileRecurring(
  organizationId: string,
  transactions: Transaction[],
  merchantProfiles: MerchantProfile[],
  now: Date = new Date(),
): Promise<RecurringReconciliation> {
  const freshItems = buildFreshRecurringItems(transactions, merchantProfiles, now);
  return recurringRepository.reconcileRecurring(organizationId, freshItems);
}
