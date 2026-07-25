import { classifyTransaction } from "@/lib/ai/classifier";
import { findRememberedCategory, learnCategory } from "@/lib/ai/memory";
import type { Category, Transaction } from "@/types/transaction";

const STORAGE_KEY = "ledgerai:transactions";

function migrateTransaction(raw: unknown): Transaction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { category, aiCategory, reviewed, ...rest } = raw as Record<
    string,
    unknown
  > & {
    category?: string;
    aiCategory?: string;
    reviewed?: unknown;
  };
  return {
    ...rest,
    aiCategory: aiCategory ?? category,
    reviewed: typeof reviewed === "boolean" ? reviewed : false,
  } as Transaction;
}

function needsClassification(t: Transaction): boolean {
  return t.confidence === undefined;
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function getTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed
      .map(migrateTransaction)
      .filter((t): t is Transaction => t !== null);

    let changed = false;
    const classified = migrated.map((t) => {
      if (!needsClassification(t)) return t;
      changed = true;
      const noteForClassification = typeof t.note === "string" ? t.note : "";
      const rememberedCategory = findRememberedCategory(noteForClassification);
      const { category, confidence, classificationSource } = rememberedCategory
        ? { category: rememberedCategory, confidence: 1.0, classificationSource: "memory" as const }
        : {
            ...classifyTransaction(noteForClassification),
            classificationSource: "classifier" as const,
          };
      return { ...t, aiCategory: category, confidence, classificationSource };
    });

    const sorted = sortTransactions(classified);
    if (changed) saveTransactions(sorted);
    return sorted;
  } catch {
    return [];
  }
}

function saveTransactions(transactions: Transaction[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

export function addTransaction(transaction: Transaction): Transaction[] {
  const updated = sortTransactions([...getTransactions(), transaction]);
  saveTransactions(updated);
  return updated;
}

export function reviewTransaction(
  id: string,
  userCategory?: Category,
): Transaction[] {
  const transactions = getTransactions();
  const target = transactions.find((t) => t.id === id);
  const learnedCategory = userCategory ?? target?.aiCategory;
  if (target && learnedCategory) {
    learnCategory(target.note, learnedCategory);
  }

  const updated = transactions.map((t) =>
    t.id === id ? { ...t, reviewed: true, userCategory } : t,
  );
  const sorted = sortTransactions(updated);
  saveTransactions(sorted);
  return sorted;
}
