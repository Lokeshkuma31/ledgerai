export interface Merchant {
  id: string;
  canonicalName: string;
  aliases: string[];
  categoryHint?: string;
  firstSeen: string; // ISO 8601 timestamp
  lastSeen: string; // ISO 8601 timestamp
  transactionCount: number;
  confidence: number; // 0-1, highest extraction confidence seen for this merchant
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

export interface MerchantStatistics {
  totalMerchants: number;
  totalTransactions: number;
  averageConfidence: number;
  topMerchants: Pick<Merchant, "id" | "canonicalName" | "transactionCount">[];
}
