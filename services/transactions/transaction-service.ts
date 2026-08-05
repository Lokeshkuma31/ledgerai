/**
 * Transaction Service — the async, Postgres-backed successor to
 * lib/storage.ts, following the repositories/+services/ split established
 * for Connection Hub. Route Handlers/Server Actions/Inngest functions call
 * this, never repositories/transaction-repository.ts directly.
 */
import { learnCategory } from "@/services/ai-memory/ai-memory-service";
import * as transactionRepository from "@/repositories/transaction-repository";
import type { Category, ClassificationSource, Transaction } from "@/types/transaction";
import {
  transactionInputSchema,
  type TransactionInput,
} from "./transaction-schema";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";

export async function listTransactions(
  organizationId: string,
): Promise<Transaction[]> {
  return transactionRepository.getTransactions(organizationId);
}

/**
 * Persists an already-classified transaction — lib/ingestion/pipeline.ts's
 * ingestTransaction() performs classification (classifyTransaction /
 * findRememberedCategory) before this is ever called, exactly as it does
 * today for the localStorage path. Unlike lib/storage.ts::getTransactions()'s
 * classify-on-read backfill (a lazy migration for pre-existing unclassified
 * localStorage rows), a fresh Postgres row is always written already
 * classified, so there is no read-time backfill step here.
 */
export async function createTransaction(
  organizationId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const parsed = transactionInputSchema.parse(input);
  const transaction = await transactionRepository.createTransaction(organizationId, parsed);

  // Publishes the domain event the job platform's classification/
  // merchant-normalize/feed-generate chain subscribes to — this service
  // never calls a job directly (docs/job-platform/01-architecture-diagram.md).
  await dispatch(
    "ledger/transaction.created",
    { organizationId, transactionId: transaction.id },
    { id: buildKey("transaction-created", transaction.id) },
  ).catch(() => undefined); // best-effort: a dispatch failure must never fail the write that already succeeded

  return transaction;
}

/** Mirrors lib/storage.ts::addTransactions for bulk sources (e.g. CSV
 * import). */
export async function createTransactions(
  organizationId: string,
  inputs: TransactionInput[],
  source?: { kind: string; id: string },
): Promise<Transaction[]> {
  const parsed = inputs.map((input) => transactionInputSchema.parse(input));
  const transactions = await transactionRepository.createTransactions(organizationId, parsed);

  const sourceKind = source?.kind ?? "batch";
  const sourceId = source?.id ?? crypto.randomUUID();
  await dispatch(
    "ledger/transaction.imported",
    { organizationId, transactionIds: transactions.map((t) => t.id), sourceKind, sourceId },
    { id: buildKey("transaction-imported", sourceKind, sourceId) },
  ).catch(() => undefined);

  return transactions;
}

/**
 * Marks a transaction reviewed and teaches AI Memory the user's chosen (or
 * confirmed AI) category, mirroring lib/storage.ts::reviewTransaction's
 * existing behavior exactly — now a real Postgres write via
 * services/ai-memory/ai-memory-service.ts (AI Memory migrated off
 * localStorage; this call site is no longer a no-op).
 */
export async function reviewTransaction(
  organizationId: string,
  id: string,
  userCategory?: Category,
): Promise<Transaction> {
  const existing = await transactionRepository.getTransactionById(
    organizationId,
    id,
  );
  if (!existing) throw new Error(`Transaction not found: ${id}`);

  const learnedCategory = userCategory ?? existing.aiCategory;
  if (learnedCategory) await learnCategory(organizationId, existing.note, learnedCategory);

  return transactionRepository.updateTransaction(organizationId, id, {
    reviewed: true,
    userCategory,
  });
}

/** Added for the background job platform's classification job — see
 * repositories/transaction-repository.ts::updateClassification's comment. */
export async function updateClassification(
  organizationId: string,
  id: string,
  aiCategory: Category,
  classificationSource: ClassificationSource,
): Promise<Transaction> {
  return transactionRepository.updateClassification(organizationId, id, { aiCategory, classificationSource });
}

export async function getTransactionById(organizationId: string, id: string): Promise<Transaction | undefined> {
  return transactionRepository.getTransactionById(organizationId, id);
}

/** Mirrors lib/storage.ts::reassignMerchant. Intended to be called inside
 * the same $transaction as the Merchant row's own update once
 * repositories/merchant-repository.ts exists (see the migration plan's
 * risk register on the merchant merge/delete transaction boundary) — not
 * yet wired to a Merchant-side caller in this pass. */
export async function reassignMerchant(
  organizationId: string,
  fromMerchantId: string,
  toMerchantId: string,
  toMerchantName: string,
): Promise<void> {
  return transactionRepository.reassignMerchant(
    organizationId,
    fromMerchantId,
    toMerchantId,
    toMerchantName,
  );
}

/** Mirrors lib/storage.ts::clearMerchantFromTransactions. */
export async function clearMerchantFromTransactions(
  organizationId: string,
  merchantId: string,
): Promise<void> {
  return transactionRepository.clearMerchantFromTransactions(
    organizationId,
    merchantId,
  );
}
