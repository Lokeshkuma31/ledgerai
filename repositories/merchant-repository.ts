/**
 * Merchant Repository — Postgres-backed persistence for merchant identity
 * (lib/merchant/registry.ts's successor) and merchant knowledge
 * (lib/merchant/knowledge-registry.ts's successor). Both localStorage
 * stores keyed off the same merchant id, so they map onto Merchant+
 * MerchantAlias and MerchantProfile respectively — kept in one repository
 * file since they're always read/written together in practice (a merchant
 * row without its knowledge, or vice versa, isn't a meaningful state).
 */
import { prisma } from "@/lib/db/prisma";
import * as transactionRepository from "@/repositories/transaction-repository";
import type {
  Merchant as PrismaMerchant,
  MerchantAlias as PrismaMerchantAlias,
  MerchantProfile as PrismaMerchantProfile,
} from "@/src/generated/prisma/client";
import type { Merchant, MerchantStatistics } from "@/types/merchant";
import type { MerchantKnowledge } from "@/types/merchant-profile";
import type { KnowledgeRecord } from "@/lib/merchant/knowledge-registry";

type MerchantRow = PrismaMerchant & { aliases: PrismaMerchantAlias[] };

function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    aliases: row.aliases.map((a) => a.alias),
    categoryHint: row.categoryHint ?? undefined,
    firstSeen: row.firstSeen.toISOString(),
    lastSeen: row.lastSeen.toISOString(),
    transactionCount: row.transactionCount,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeAliases = { aliases: true };

/** Looks up a merchant by id, canonical name, or known alias — mirrors
 * lib/merchant/registry.ts::findMerchant. `idOrName` is checked as an id
 * first (cheap indexed lookup); the name/alias fallback needs a
 * case-insensitive scan since aliases aren't normalized at write time,
 * matching the original's exact matching semantics. */
export async function findMerchant(
  organizationId: string,
  idOrName: string,
): Promise<Merchant | undefined> {
  const byId = await prisma.merchant.findFirst({
    where: { id: idOrName, organizationId, deletedAt: null },
    include: includeAliases,
  });
  if (byId) return toMerchant(byId);

  const lower = idOrName.trim().toLowerCase();
  const candidates = await prisma.merchant.findMany({
    where: { organizationId, deletedAt: null },
    include: includeAliases,
  });
  const match = candidates.find(
    (m) =>
      m.canonicalName.toLowerCase() === lower ||
      m.aliases.some((a) => a.alias.toLowerCase() === lower),
  );
  return match ? toMerchant(match) : undefined;
}

export async function getAllMerchants(organizationId: string): Promise<Merchant[]> {
  const rows = await prisma.merchant.findMany({
    where: { organizationId, deletedAt: null },
    include: includeAliases,
    orderBy: { lastSeen: "desc" },
  });
  return rows.map(toMerchant);
}

export interface RegisterMerchantInput {
  canonicalName: string;
  categoryHint?: string;
  confidence: number;
  alias?: string;
}

/** Upserts a merchant sighting, mirroring lib/merchant/registry.ts::
 * registerMerchant's find-or-create-then-bump semantics exactly (new
 * alias folded in, lastSeen/transactionCount bumped, confidence
 * max'd) — one $transaction so the alias insert and the count/lastSeen
 * bump commit together. */
export async function registerMerchant(
  organizationId: string,
  input: RegisterMerchantInput,
): Promise<Merchant> {
  const existing = await findMerchant(organizationId, input.canonicalName);
  const now = new Date();

  if (existing) {
    const hasAlias =
      !input.alias ||
      existing.aliases.some((a) => a.toLowerCase() === input.alias!.toLowerCase()) ||
      existing.canonicalName.toLowerCase() === input.alias.toLowerCase();

    const row = await prisma.$transaction(async (tx) => {
      if (!hasAlias) {
        await tx.merchantAlias.create({
          data: { merchantId: existing.id, alias: input.alias! },
        });
      }
      return tx.merchant.update({
        where: { id: existing.id },
        data: {
          categoryHint: existing.categoryHint ?? input.categoryHint,
          lastSeen: now,
          transactionCount: { increment: 1 },
          confidence: Math.max(existing.confidence, input.confidence),
        },
        include: includeAliases,
      });
    });
    return toMerchant(row);
  }

  const hasDistinctAlias =
    input.alias && input.alias.toLowerCase() !== input.canonicalName.toLowerCase();
  const row = await prisma.merchant.create({
    data: {
      organizationId,
      canonicalName: input.canonicalName,
      categoryHint: input.categoryHint,
      firstSeen: now,
      lastSeen: now,
      transactionCount: 1,
      confidence: input.confidence,
      aliases: hasDistinctAlias ? { create: [{ alias: input.alias! }] } : undefined,
    },
    include: includeAliases,
  });
  return toMerchant(row);
}

/**
 * Merges sourceId into targetId, mirroring lib/merchant/registry.ts::
 * mergeMerchant's combine-aliases/sum-counts/widen-dates semantics, AND
 * repoints every Transaction row pointing at sourceId — the two localStorage
 * versions of this operation (lib/merchant/registry.ts::mergeMerchant,
 * lib/storage.ts::reassignMerchant) were always called back-to-back by
 * callers with no shared atomicity; here they're one prisma.$transaction,
 * per the migration plan's risk register §7.3.
 */
export async function mergeMerchant(
  organizationId: string,
  sourceId: string,
  targetId: string,
): Promise<Merchant> {
  if (sourceId === targetId) {
    throw new Error("Cannot merge a merchant into itself.");
  }

  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.merchant.findFirst({ where: { id: sourceId, organizationId }, include: includeAliases }),
      tx.merchant.findFirst({ where: { id: targetId, organizationId }, include: includeAliases }),
    ]);
    if (!source || !target) {
      throw new Error("Cannot merge: source or target merchant not found.");
    }

    const targetLower = target.canonicalName.toLowerCase();
    const mergedAliasNames = Array.from(
      new Set([
        ...target.aliases.map((a) => a.alias),
        source.canonicalName,
        ...source.aliases.map((a) => a.alias),
      ]),
    ).filter((alias) => alias.toLowerCase() !== targetLower);

    const existingTargetAliases = new Set(target.aliases.map((a) => a.alias.toLowerCase()));
    const aliasesToAdd = mergedAliasNames.filter(
      (alias) => !existingTargetAliases.has(alias.toLowerCase()),
    );

    const updated = await tx.merchant.update({
      where: { id: targetId },
      data: {
        categoryHint: target.categoryHint ?? source.categoryHint,
        firstSeen: source.firstSeen < target.firstSeen ? source.firstSeen : target.firstSeen,
        lastSeen: source.lastSeen > target.lastSeen ? source.lastSeen : target.lastSeen,
        transactionCount: target.transactionCount + source.transactionCount,
        confidence: Math.max(target.confidence, source.confidence),
        aliases: aliasesToAdd.length > 0 ? { create: aliasesToAdd.map((alias) => ({ alias })) } : undefined,
      },
      include: includeAliases,
    });

    await transactionRepository.reassignMerchant(
      organizationId,
      sourceId,
      targetId,
      target.canonicalName,
      tx,
    );
    await tx.merchant.delete({ where: { id: sourceId } });

    return toMerchant(updated);
  });
}

/** Deletes a merchant and clears it from every referencing Transaction row
 * in the same $transaction — mirrors lib/merchant/registry.ts::
 * deleteMerchant + lib/storage.ts::clearMerchantFromTransactions, called
 * atomically for the same risk-register reason as mergeMerchant above. */
export async function deleteMerchant(organizationId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await transactionRepository.clearMerchantFromTransactions(organizationId, id, tx);
    await tx.merchant.deleteMany({ where: { id, organizationId } });
  });
}

export async function getMerchantStatistics(organizationId: string): Promise<MerchantStatistics> {
  const merchants = await getAllMerchants(organizationId);
  const totalMerchants = merchants.length;
  const totalTransactions = merchants.reduce((sum, m) => sum + m.transactionCount, 0);
  const averageConfidence =
    totalMerchants === 0
      ? 0
      : merchants.reduce((sum, m) => sum + m.confidence, 0) / totalMerchants;
  const topMerchants = [...merchants]
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, 5)
    .map((m) => ({ id: m.id, canonicalName: m.canonicalName, transactionCount: m.transactionCount }));

  return { totalMerchants, totalTransactions, averageConfidence, topMerchants };
}

// --- Merchant Knowledge (lib/merchant/knowledge-registry.ts's successor) ---

function toKnowledgeRecord(row: PrismaMerchantProfile): KnowledgeRecord {
  return {
    merchantId: row.merchantId,
    industry: row.industry,
    merchantType: row.merchantType,
    defaultCategory: row.defaultCategory,
    subcategories: row.subcategories,
    tags: row.tags,
    country: row.country ?? undefined,
    isOnline: row.isOnline,
    isRecurringFriendly: row.isRecurringFriendly,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findKnowledge(merchantId: string): Promise<KnowledgeRecord | undefined> {
  const row = await prisma.merchantProfile.findUnique({ where: { merchantId } });
  return row ? toKnowledgeRecord(row) : undefined;
}

/** Scoped through the owning Merchant row since MerchantProfile has no
 * organizationId column of its own (merchantId is its primary key). */
export async function getAllKnowledge(organizationId: string): Promise<KnowledgeRecord[]> {
  const rows = await prisma.merchantProfile.findMany({
    where: { merchant: { organizationId } },
  });
  return rows.map(toKnowledgeRecord);
}

export async function upsertKnowledge(
  merchantId: string,
  knowledge: MerchantKnowledge,
): Promise<KnowledgeRecord> {
  const data = {
    industry: knowledge.industry,
    merchantType: knowledge.merchantType,
    defaultCategory: knowledge.defaultCategory,
    subcategories: knowledge.subcategories,
    tags: knowledge.tags,
    country: knowledge.country ?? null,
    isOnline: knowledge.isOnline,
    isRecurringFriendly: knowledge.isRecurringFriendly,
  };
  const row = await prisma.merchantProfile.upsert({
    where: { merchantId },
    create: { merchantId, ...data },
    update: data,
  });
  return toKnowledgeRecord(row);
}

export async function deleteKnowledge(merchantId: string): Promise<void> {
  await prisma.merchantProfile.delete({ where: { merchantId } }).catch(() => undefined);
}
