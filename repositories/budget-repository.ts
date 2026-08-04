/**
 * Budget Repository — Postgres-backed persistence for lib/budget/storage.ts's
 * successor. lib/budget/engine.ts (status calculation) is pure and stays
 * untouched; only the storage half migrates.
 */
import { prisma } from "@/lib/db/prisma";
import { categoryLabel, getCategoryCache, resolveCategoryId } from "@/repositories/category-repository";
import type { Budget as PrismaBudget } from "@/src/generated/prisma/client";
import type { Budget } from "@/types/budget";
import type { Category } from "@/types/transaction";

async function toBudget(row: PrismaBudget): Promise<Budget> {
  const cache = await getCategoryCache();
  return {
    id: row.id,
    category: categoryLabel(row.categoryId, cache) as Category,
    monthlyLimit: row.monthlyLimit.toNumber(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getBudgets(organizationId: string): Promise<Budget[]> {
  const rows = await prisma.budget.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(rows.map(toBudget));
}

/** Mirrors lib/budget/storage.ts::addBudget's one-budget-per-category
 * uniqueness check — the schema's @@unique([organizationId, categoryId])
 * enforces the same rule at the database level, so a race between two
 * concurrent requests still can't create duplicates the way the old
 * read-then-write localStorage check theoretically could. */
export async function addBudget(
  organizationId: string,
  category: Category,
  monthlyLimit: number,
): Promise<Budget> {
  const categoryId = await resolveCategoryId(category);
  const row = await prisma.budget
    .create({
      data: { organizationId, categoryId, monthlyLimit: monthlyLimit.toFixed(2) },
    })
    .catch((error) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        throw new Error(`A budget for ${category} already exists.`);
      }
      throw error;
    });
  return toBudget(row);
}

export async function updateBudgetLimit(
  organizationId: string,
  id: string,
  monthlyLimit: number,
): Promise<Budget> {
  // update() only accepts a unique where (id alone here), so organizationId
  // is enforced via updateMany's count check instead — mirrors deleteBudget
  // below and reassignMerchant's ownership-scoping pattern.
  const { count } = await prisma.budget.updateMany({
    where: { id, organizationId },
    data: { monthlyLimit: monthlyLimit.toFixed(2) },
  });
  if (count === 0) throw new Error(`Budget not found: ${id}`);
  const row = await prisma.budget.findUniqueOrThrow({ where: { id } });
  return toBudget(row);
}

export async function deleteBudget(organizationId: string, id: string): Promise<void> {
  await prisma.budget.deleteMany({ where: { id, organizationId } });
}
