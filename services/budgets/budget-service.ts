/**
 * Budget Service — the async, Postgres-backed successor to
 * lib/budget/storage.ts. lib/budget/engine.ts::calculateBudgetStatus is
 * pure and unchanged; this service is the one place that joins it against
 * real Transaction data, mirroring how lib/intelligence/orchestrator.ts
 * calls it today.
 */
import { calculateBudgetStatus } from "@/lib/budget/engine";
import * as budgetRepository from "@/repositories/budget-repository";
import { listTransactions } from "@/services/transactions/transaction-service";
import type { Budget, BudgetStatus } from "@/types/budget";
import {
  addBudgetInputSchema,
  updateBudgetLimitInputSchema,
  type AddBudgetInput,
  type UpdateBudgetLimitInput,
} from "./budget-schema";

export async function listBudgets(organizationId: string): Promise<Budget[]> {
  return budgetRepository.getBudgets(organizationId);
}

export async function addBudget(
  organizationId: string,
  input: AddBudgetInput,
): Promise<Budget> {
  const parsed = addBudgetInputSchema.parse(input);
  return budgetRepository.addBudget(organizationId, parsed.category, parsed.monthlyLimit);
}

export async function updateBudgetLimit(
  organizationId: string,
  input: UpdateBudgetLimitInput,
): Promise<Budget> {
  const parsed = updateBudgetLimitInputSchema.parse(input);
  return budgetRepository.updateBudgetLimit(organizationId, parsed.id, parsed.monthlyLimit);
}

export async function deleteBudget(organizationId: string, id: string): Promise<void> {
  return budgetRepository.deleteBudget(organizationId, id);
}

export async function getBudgetStatuses(
  organizationId: string,
  now: Date = new Date(),
): Promise<BudgetStatus[]> {
  const [budgets, transactions] = await Promise.all([
    budgetRepository.getBudgets(organizationId),
    listTransactions(organizationId),
  ]);
  return calculateBudgetStatus(budgets, transactions, now);
}
