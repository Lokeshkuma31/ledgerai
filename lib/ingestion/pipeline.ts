import { classifyTransaction } from "@/lib/ai/classifier";
import { findRememberedCategory } from "@/lib/ai/memory";
import { identifyMerchant } from "@/lib/merchant/engine";
import type { PaymentMethod, Transaction } from "@/types/transaction";

export interface IngestInput {
  amount: number;
  note: string;
  paymentMethod: PaymentMethod;
  date: string;
}

export function isValidDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function validateInput(input: IngestInput): void {
  if (!(input.amount > 0)) {
    throw new Error("Amount must be greater than zero.");
  }
  if (input.note.trim().length === 0) {
    throw new Error("Transaction note is required.");
  }
  if (!isValidDate(input.date)) {
    throw new Error("Invalid transaction date.");
  }
}

function collapseWhitespace(note: string): string {
  return note.trim().replace(/\s+/g, " ");
}

function normalizeNote(note: string): string {
  const collapsed = collapseWhitespace(note);
  const lower = collapsed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function generateMetadata(): { id: string; createdAt: string } {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

/**
 * Single entry point for every transaction source (manual entry today;
 * SMS/UPI notifications/bank APIs/etc. in future milestones all funnel
 * through this same function). Pure TypeScript — no React, no localStorage.
 *
 * Flow: Validation -> Normalization -> Merchant Extraction -> Merchant
 * Registry -> AI Memory -> Classifier. Storage happens outside this
 * function, in whichever source called it.
 */
export function ingestTransaction(input: IngestInput): Transaction {
  validateInput(input);

  // Merchant extraction relies on capitalization (e.g. "at Starbucks"), so
  // it runs on the whitespace-collapsed but case-preserved note — not the
  // lowercased-for-display `note` below, which the classifier/memory don't
  // need original casing for anyway (both lowercase internally).
  const merchant = identifyMerchant(collapseWhitespace(input.note));

  const note = normalizeNote(input.note);
  const { id, createdAt } = generateMetadata();

  const rememberedCategory = findRememberedCategory(note);
  const { category, confidence, classificationSource } = rememberedCategory
    ? { category: rememberedCategory, confidence: 1.0, classificationSource: "memory" as const }
    : { ...classifyTransaction(note), classificationSource: "classifier" as const };

  return {
    id,
    amount: input.amount,
    note,
    paymentMethod: input.paymentMethod,
    date: input.date,
    createdAt,
    aiCategory: category,
    confidence,
    classificationSource,
    reviewed: false,
    merchantId: merchant?.merchantId,
    merchantName: merchant?.merchantName,
    merchantConfidence: merchant?.merchantConfidence,
  };
}
