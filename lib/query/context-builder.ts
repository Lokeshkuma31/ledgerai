import type { ExecutionPlan, QueryContext } from "@/types/query";
import type { Transaction } from "@/types/transaction";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Rounds every numeric value in a plain object/array tree — currency and
 * percentage figures shouldn't reach the LLM with floating-point noise. */
function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return round(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundDeep(v)]),
    );
  }
  return value;
}

/** Only "transaction-search" ever surfaces raw transactions, and even
 * then only the fields relevant to explaining a purchase — never internal
 * bookkeeping like id, createdAt, or classification confidence. */
function trimTransaction(t: Transaction) {
  return {
    date: t.date,
    note: t.note,
    amount: t.amount,
    category: t.userCategory ?? t.aiCategory ?? "Other",
    merchant: t.merchantName ?? null,
    paymentMethod: t.paymentMethod,
  };
}

function trimTransactionFields(raw: Record<string, unknown>): Record<string, unknown> {
  const result = { ...raw };
  if (Array.isArray(result.transactions)) {
    result.transactions = (result.transactions as Transaction[]).map(trimTransaction);
  }
  if (result.transaction && typeof result.transaction === "object") {
    result.transaction = trimTransaction(result.transaction as Transaction);
  }
  return result;
}

/**
 * Turns the executor's raw result into the final structured context the
 * AI Coach receives — rounds numbers, echoes back which period/entities
 * the question resolved to, and (for transaction-search only) trims
 * transactions down to display-relevant fields. This is the *only* place
 * a raw Transaction object is allowed to leave the query engine.
 */
export function buildQueryContext(plan: ExecutionPlan, rawResult: Record<string, unknown>): QueryContext {
  const shaped =
    plan.intent === "transaction-search" ? trimTransactionFields(rawResult) : rawResult;

  const context: QueryContext = {
    intent: plan.intent,
    ...(roundDeep(shaped) as Record<string, unknown>),
  };

  if (plan.entities.dateRange) context.period = plan.entities.dateRange.label;
  if (plan.entities.merchant && !("merchant" in context)) context.merchant = plan.entities.merchant;
  if (plan.entities.category && !("category" in context)) context.category = plan.entities.category;

  return context;
}
