import { findMerchant, getAllMerchants } from "@/lib/merchant/registry";
import { lookupKnowledge } from "@/lib/merchant/knowledge-rules";
import {
  deleteKnowledge,
  findKnowledge,
  upsertKnowledge,
} from "@/lib/merchant/knowledge-registry";
import { getTransactions } from "@/lib/storage";
import type { Merchant } from "@/types/merchant";
import type { MerchantProfile } from "@/types/merchant-profile";
import type { Transaction } from "@/types/transaction";

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

function buildProfile(merchant: Merchant, transactions: Transaction[]): MerchantProfile {
  const knowledge =
    findKnowledge(merchant.id) ??
    upsertKnowledge(merchant.id, lookupKnowledge(merchant.canonicalName, merchant.categoryHint));

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

/**
 * Called automatically whenever a merchant is registered or re-sighted
 * (see lib/merchant/engine.ts's identifyMerchant) — computes and persists
 * rule-derived knowledge for it. A no-op if the merchant is already
 * enriched: knowledge is a pure function of canonicalName, so nothing
 * changes between sightings.
 */
export function enrichMerchant(merchant: Merchant): void {
  if (findKnowledge(merchant.id)) return;
  upsertKnowledge(
    merchant.id,
    lookupKnowledge(merchant.canonicalName, merchant.categoryHint),
  );
}

/** Explicit re-enrichment, used after a merge where the surviving
 * merchant's identity may now differ from what was last enriched. */
export function refreshMerchantKnowledge(merchantId: string): void {
  const merchant = findMerchant(merchantId);
  if (!merchant) return;
  upsertKnowledge(
    merchant.id,
    lookupKnowledge(merchant.canonicalName, merchant.categoryHint),
  );
}

export function removeMerchantKnowledge(merchantId: string): void {
  deleteKnowledge(merchantId);
}

export function getMerchantProfile(merchantId: string): MerchantProfile | undefined {
  const merchant = findMerchant(merchantId);
  if (!merchant) return undefined;
  return buildProfile(merchant, getTransactions());
}

/** Every known merchant, enriched — lazily backfills knowledge for any
 * merchant that predates this milestone or was otherwise never enriched. */
export function getAllMerchantProfiles(): MerchantProfile[] {
  const transactions = getTransactions();
  return getAllMerchants().map((merchant) => buildProfile(merchant, transactions));
}
