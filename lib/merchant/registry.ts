import type { Merchant, MerchantStatistics } from "@/types/merchant";

const MERCHANT_STORAGE_KEY = "ledgerai:merchants";

export interface RegisterMerchantInput {
  canonicalName: string;
  categoryHint?: string;
  confidence: number;
  /** Raw text fragment that triggered this match, tracked as an alias. */
  alias?: string;
}

function readMerchants(): Merchant[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MERCHANT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Merchant[]) : [];
  } catch {
    return [];
  }
}

function writeMerchants(merchants: Merchant[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MERCHANT_STORAGE_KEY, JSON.stringify(merchants));
}

function matchesCanonicalNameOrAlias(merchant: Merchant, name: string): boolean {
  const lower = name.trim().toLowerCase();
  return (
    merchant.canonicalName.toLowerCase() === lower ||
    merchant.aliases.some((alias) => alias.toLowerCase() === lower)
  );
}

/** Looks up a merchant by id, canonical name, or known alias. */
export function findMerchant(idOrName: string): Merchant | undefined {
  const merchants = readMerchants();
  return (
    merchants.find((m) => m.id === idOrName) ??
    merchants.find((m) => matchesCanonicalNameOrAlias(m, idOrName))
  );
}

export function getAllMerchants(): Merchant[] {
  return readMerchants();
}

/**
 * Upserts a merchant sighting: creates a new merchant on first sight, or
 * bumps lastSeen/transactionCount (and folds in any new alias) on repeat
 * sightings of an existing one.
 */
export function registerMerchant(input: RegisterMerchantInput): Merchant {
  const merchants = readMerchants();
  const now = new Date().toISOString();
  const existingIndex = merchants.findIndex((m) =>
    matchesCanonicalNameOrAlias(m, input.canonicalName),
  );

  if (existingIndex !== -1) {
    const existing = merchants[existingIndex];
    const hasAlias =
      !input.alias ||
      existing.aliases.some((a) => a.toLowerCase() === input.alias!.toLowerCase()) ||
      existing.canonicalName.toLowerCase() === input.alias.toLowerCase();
    const updated: Merchant = {
      ...existing,
      aliases: hasAlias ? existing.aliases : [...existing.aliases, input.alias!],
      categoryHint: existing.categoryHint ?? input.categoryHint,
      lastSeen: now,
      transactionCount: existing.transactionCount + 1,
      confidence: Math.max(existing.confidence, input.confidence),
      updatedAt: now,
    };
    merchants[existingIndex] = updated;
    writeMerchants(merchants);
    return updated;
  }

  const created: Merchant = {
    id: crypto.randomUUID(),
    canonicalName: input.canonicalName,
    aliases: input.alias && input.alias.toLowerCase() !== input.canonicalName.toLowerCase()
      ? [input.alias]
      : [],
    categoryHint: input.categoryHint,
    firstSeen: now,
    lastSeen: now,
    transactionCount: 1,
    confidence: input.confidence,
    createdAt: now,
    updatedAt: now,
  };
  merchants.push(created);
  writeMerchants(merchants);
  return created;
}

/**
 * Merges `sourceId` into `targetId`: combines aliases, sums transaction
 * counts, and widens firstSeen/lastSeen to cover both. The source merchant
 * is removed. Callers that also track merchant references elsewhere (e.g.
 * transactions) are responsible for repointing those separately — the
 * registry has no knowledge of them.
 */
export function mergeMerchant(sourceId: string, targetId: string): Merchant {
  if (sourceId === targetId) {
    throw new Error("Cannot merge a merchant into itself.");
  }
  const merchants = readMerchants();
  const source = merchants.find((m) => m.id === sourceId);
  const target = merchants.find((m) => m.id === targetId);
  if (!source || !target) {
    throw new Error("Cannot merge: source or target merchant not found.");
  }

  const now = new Date().toISOString();
  const mergedAliases = Array.from(
    new Set([...target.aliases, source.canonicalName, ...source.aliases]),
  ).filter((alias) => alias.toLowerCase() !== target.canonicalName.toLowerCase());

  const merged: Merchant = {
    ...target,
    aliases: mergedAliases,
    categoryHint: target.categoryHint ?? source.categoryHint,
    firstSeen: source.firstSeen < target.firstSeen ? source.firstSeen : target.firstSeen,
    lastSeen: source.lastSeen > target.lastSeen ? source.lastSeen : target.lastSeen,
    transactionCount: target.transactionCount + source.transactionCount,
    confidence: Math.max(target.confidence, source.confidence),
    updatedAt: now,
  };

  const remaining = merchants
    .filter((m) => m.id !== sourceId)
    .map((m) => (m.id === targetId ? merged : m));
  writeMerchants(remaining);
  return merged;
}

export function deleteMerchant(id: string): void {
  writeMerchants(readMerchants().filter((m) => m.id !== id));
}

export function getMerchantStatistics(): MerchantStatistics {
  const merchants = readMerchants();
  const totalMerchants = merchants.length;
  const totalTransactions = merchants.reduce((sum, m) => sum + m.transactionCount, 0);
  const averageConfidence =
    totalMerchants === 0
      ? 0
      : merchants.reduce((sum, m) => sum + m.confidence, 0) / totalMerchants;
  const topMerchants = [...merchants]
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      canonicalName: m.canonicalName,
      transactionCount: m.transactionCount,
    }));

  return { totalMerchants, totalTransactions, averageConfidence, topMerchants };
}
