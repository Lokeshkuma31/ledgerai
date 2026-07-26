import type { MerchantKnowledge } from "@/types/merchant-profile";

const KNOWLEDGE_STORAGE_KEY = "ledgerai:merchant-knowledge";

export interface KnowledgeRecord extends MerchantKnowledge {
  merchantId: string;
  updatedAt: string;
}

/**
 * Persists only the rule-derived enrichment attributes, keyed by merchant
 * id — identity fields (canonicalName, aliases, transactionCount, ...)
 * stay owned by lib/merchant/registry.ts and are never duplicated here.
 */
function readKnowledge(): KnowledgeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KnowledgeRecord[]) : [];
  } catch {
    return [];
  }
}

function writeKnowledge(records: KnowledgeRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(records));
}

export function findKnowledge(merchantId: string): KnowledgeRecord | undefined {
  return readKnowledge().find((r) => r.merchantId === merchantId);
}

export function getAllKnowledge(): KnowledgeRecord[] {
  return readKnowledge();
}

export function upsertKnowledge(
  merchantId: string,
  knowledge: MerchantKnowledge,
): KnowledgeRecord {
  const records = readKnowledge();
  const record: KnowledgeRecord = {
    merchantId,
    ...knowledge,
    updatedAt: new Date().toISOString(),
  };
  const index = records.findIndex((r) => r.merchantId === merchantId);
  if (index === -1) {
    records.push(record);
  } else {
    records[index] = record;
  }
  writeKnowledge(records);
  return record;
}

export function deleteKnowledge(merchantId: string): void {
  writeKnowledge(readKnowledge().filter((r) => r.merchantId !== merchantId));
}
