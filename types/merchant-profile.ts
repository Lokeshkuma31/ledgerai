/** Deterministic, rule-derived merchant knowledge — never LLM output. */
export interface MerchantKnowledge {
  industry: string;
  merchantType: string;
  defaultCategory: string;
  subcategories: string[];
  tags: string[];
  country?: string;
  isOnline: boolean;
  isRecurringFriendly: boolean;
}

/**
 * The single source of truth for merchant information across the app:
 * identity (from the merchant registry) + knowledge (from the rules
 * engine) + spend stats (derived from actual transactions at read time).
 */
export interface MerchantProfile extends MerchantKnowledge {
  id: string;
  canonicalName: string;
  aliases: string[];
  averageTransactionAmount: number;
  totalSpend: number;
  transactionCount: number;
  confidence: number;
  firstSeen: string; // ISO 8601
  lastSeen: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface MerchantSpendSummary {
  id: string;
  canonicalName: string;
  totalSpend: number;
  transactionCount: number;
  averageTransactionAmount: number;
}

export interface MerchantKnowledgeStatistics {
  topMerchantsBySpend: MerchantSpendSummary[];
  mostExpensiveMerchant: MerchantSpendSummary | null;
  mostFrequentMerchant: MerchantSpendSummary | null;
  /** "Growing" = highest transactions-per-day between first and last
   * sighting. Only considers merchants seen at least twice. */
  fastestGrowingMerchant: (MerchantSpendSummary & { transactionsPerDay: number }) | null;
  newestMerchant: { id: string; canonicalName: string; firstSeen: string } | null;
}
