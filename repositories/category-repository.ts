/**
 * Category lookup — shared by every repository that stores a Category FK
 * (Transaction.aiCategoryId/userCategoryId, Budget.categoryId, ...).
 * Category is an effectively-static, seed-only 11-row reference table
 * (prisma/seed.ts), so key<->id is cached in module memory rather than
 * queried per row — safe because this table only ever changes via a new
 * seed run, never at request time.
 */
import { prisma } from "@/lib/db/prisma";

interface CategoryCache {
  byKey: Map<string, string>;
  byId: Map<string, string>;
}

let cache: CategoryCache | null = null;

export async function getCategoryCache(): Promise<CategoryCache> {
  if (cache) return cache;
  const rows = await prisma.category.findMany();
  cache = {
    byKey: new Map(rows.map((r) => [r.key, r.id])),
    byId: new Map(rows.map((r) => [r.id, r.key])),
  };
  return cache;
}

// prisma/seed.ts's Category.key is the lowercase slug of types/transaction.ts's
// CATEGORIES label (e.g. "food" <-> "Food") — every existing category name
// is a single word, so this transform is exact and avoids maintaining a
// second key<->label table that would need updating alongside CATEGORIES.
function labelToKey(label: string): string {
  return label.toLowerCase();
}
function keyToLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export async function resolveCategoryId(label: string): Promise<string>;
export async function resolveCategoryId(label: string | undefined): Promise<string | null>;
export async function resolveCategoryId(label: string | undefined): Promise<string | null> {
  if (!label) return null;
  const { byKey } = await getCategoryCache();
  const id = byKey.get(labelToKey(label));
  if (!id) throw new Error(`Unknown category: ${label}`);
  return id;
}

export function categoryLabel(id: string | null, cacheValue: CategoryCache): string | undefined {
  if (!id) return undefined;
  const key = cacheValue.byId.get(id);
  return key ? keyToLabel(key) : undefined;
}
