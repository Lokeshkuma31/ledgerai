/**
 * Merchant Service — the async, Postgres-backed successor to
 * lib/merchant/registry.ts + lib/merchant/knowledge-registry.ts +
 * lib/merchant/knowledge.ts's orchestration (the latter combined identity,
 * knowledge, and transaction-derived spend stats into one MerchantProfile;
 * that combining logic lives here now since it always touched more than
 * one persistence module even before this migration).
 */
import { lookupKnowledge } from "@/lib/merchant/knowledge-rules";
import * as merchantRepository from "@/repositories/merchant-repository";
import { listTransactions } from "@/services/transactions/transaction-service";
import type { Merchant, MerchantStatistics } from "@/types/merchant";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { Transaction } from "@/types/transaction";
import {
  registerMerchantInputSchema,
  type RegisterMerchantInput,
} from "./merchant-schema";

export async function findMerchant(
  organizationId: string,
  idOrName: string,
): Promise<Merchant | undefined> {
  return merchantRepository.findMerchant(organizationId, idOrName);
}

export async function getAllMerchants(organizationId: string): Promise<Merchant[]> {
  return merchantRepository.getAllMerchants(organizationId);
}

export async function getMerchantStatistics(
  organizationId: string,
): Promise<MerchantStatistics> {
  return merchantRepository.getMerchantStatistics(organizationId);
}

/** Registers a merchant sighting then enriches it with rule-derived
 * knowledge on first sight only, mirroring lib/merchant/knowledge.ts::
 * enrichMerchant's "no-op if already enriched" behavior — knowledge is a
 * pure function of canonicalName, so nothing changes between sightings. */
export async function registerMerchant(
  organizationId: string,
  input: RegisterMerchantInput,
): Promise<Merchant> {
  const parsed = registerMerchantInputSchema.parse(input);
  const merchant = await merchantRepository.registerMerchant(organizationId, parsed);

  const existingKnowledge = await merchantRepository.findKnowledge(merchant.id);
  if (!existingKnowledge) {
    await merchantRepository.upsertKnowledge(
      merchant.id,
      lookupKnowledge(merchant.canonicalName, merchant.categoryHint),
    );
  }
  return merchant;
}

/** Mirrors lib/merchant/knowledge.ts::refreshMerchantKnowledge, run right
 * after a merge since the surviving merchant's identity may now differ
 * from what was last enriched (e.g. a new canonicalName won by the
 * merge). The source merchant's own knowledge row is already gone —
 * MerchantProfile's onDelete: Cascade FK to Merchant removes it inside
 * merchantRepository.mergeMerchant's own transaction. */
export async function mergeMerchant(
  organizationId: string,
  sourceId: string,
  targetId: string,
): Promise<Merchant> {
  const merged = await merchantRepository.mergeMerchant(organizationId, sourceId, targetId);
  await merchantRepository.upsertKnowledge(
    merged.id,
    lookupKnowledge(merged.canonicalName, merged.categoryHint),
  );
  return merged;
}

/** MerchantProfile's onDelete: Cascade FK to Merchant removes the
 * knowledge row automatically — no separate deleteKnowledge call needed,
 * unlike the old two-independent-localStorage-writes version. */
export async function deleteMerchant(organizationId: string, id: string): Promise<void> {
  await merchantRepository.deleteMerchant(organizationId, id);
}

function computeSpend(
  merchantId: string,
  transactions: Transaction[],
): { totalSpend: number; transactionCount: number; averageTransactionAmount: number } {
  const matches = transactions.filter((t) => t.merchantId === merchantId);
  const totalSpend = matches.reduce((sum, t) => sum + t.amount, 0);
  const transactionCount = matches.length;
  const averageTransactionAmount =
    transactionCount === 0 ? 0 : totalSpend / transactionCount;
  return { totalSpend, transactionCount, averageTransactionAmount };
}

async function buildProfile(
  merchant: Merchant,
  transactions: Transaction[],
): Promise<MerchantProfile> {
  let knowledge = await merchantRepository.findKnowledge(merchant.id);
  if (!knowledge) {
    knowledge = await merchantRepository.upsertKnowledge(
      merchant.id,
      lookupKnowledge(merchant.canonicalName, merchant.categoryHint),
    );
  }

  const { totalSpend, transactionCount, averageTransactionAmount } = computeSpend(
    merchant.id,
    transactions,
  );

  return {
    id: merchant.id,
    canonicalName: merchant.canonicalName,
    aliases: merchant.aliases,
    industry: knowledge.industry,
    merchantType: knowledge.merchantType,
    defaultCategory: knowledge.defaultCategory,
    subcategories: knowledge.subcategories,
    tags: knowledge.tags,
    country: knowledge.country,
    isOnline: knowledge.isOnline,
    isRecurringFriendly: knowledge.isRecurringFriendly,
    averageTransactionAmount,
    totalSpend,
    // Derived from actual transactions rather than the identity registry's
    // own counter, so it self-corrects if a transaction is ever removed.
    transactionCount,
    confidence: merchant.confidence,
    firstSeen: merchant.firstSeen,
    lastSeen: merchant.lastSeen,
    updatedAt: merchant.updatedAt,
  };
}

export async function getMerchantProfile(
  organizationId: string,
  merchantId: string,
): Promise<MerchantProfile | undefined> {
  const merchant = await merchantRepository.findMerchant(organizationId, merchantId);
  if (!merchant) return undefined;
  const transactions = await listTransactions(organizationId);
  return buildProfile(merchant, transactions);
}

/** Every known merchant, enriched — mirrors lib/merchant/knowledge.ts::
 * getAllMerchantProfiles' lazy knowledge backfill for any merchant that
 * predates enrichment. */
export async function getAllMerchantProfiles(
  organizationId: string,
): Promise<MerchantProfile[]> {
  const [merchants, transactions] = await Promise.all([
    merchantRepository.getAllMerchants(organizationId),
    listTransactions(organizationId),
  ]);
  return Promise.all(merchants.map((merchant) => buildProfile(merchant, transactions)));
}
