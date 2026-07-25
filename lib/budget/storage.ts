import type { Budget } from "@/types/budget";
import type { Category } from "@/types/transaction";

const STORAGE_KEY = "ledgerai:budgets";

function readBudgets(): Budget[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Budget[]) : [];
  } catch {
    return [];
  }
}

function writeBudgets(budgets: Budget[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
}

export function getBudgets(): Budget[] {
  return readBudgets();
}

export function addBudget(category: Category, monthlyLimit: number): Budget[] {
  const budgets = readBudgets();
  if (budgets.some((b) => b.category === category)) {
    throw new Error(`A budget for ${category} already exists.`);
  }
  const budget: Budget = {
    id: crypto.randomUUID(),
    category,
    monthlyLimit,
    createdAt: new Date().toISOString(),
  };
  const updated = [...budgets, budget];
  writeBudgets(updated);
  return updated;
}

export function updateBudgetLimit(id: string, monthlyLimit: number): Budget[] {
  const updated = readBudgets().map((b) =>
    b.id === id ? { ...b, monthlyLimit } : b,
  );
  writeBudgets(updated);
  return updated;
}

export function deleteBudget(id: string): Budget[] {
  const updated = readBudgets().filter((b) => b.id !== id);
  writeBudgets(updated);
  return updated;
}
