import { describe, expect, it } from "vitest";
import { findMatchingTransaction, toIngestInput } from "@/lib/email/matcher";
import type { ExtractedEmailFields, ExtractedEmailTransactionLine } from "@/lib/email/types";
import type { Transaction } from "@/types/transaction";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "t1",
    amount: 799,
    note: "Payment at amazon.in",
    paymentMethod: "Credit Card",
    date: "2026-07-12",
    createdAt: "2026-07-12T00:00:00.000Z",
    reviewed: false,
    merchantName: "Amazon.in",
    ...overrides,
  };
}

function line(overrides: Partial<ExtractedEmailTransactionLine> = {}): ExtractedEmailTransactionLine {
  return { description: "Amazon.in", amount: 799, date: "2026-07-12", direction: "debit", ...overrides };
}

describe("findMatchingTransaction", () => {
  it("matches on amount + date proximity + merchant", () => {
    const existing = [transaction()];
    const match = findMatchingTransaction(line(), "Amazon.in", existing);
    expect(match?.id).toBe("t1");
  });

  it("does not match when the amount differs", () => {
    const existing = [transaction({ amount: 500 })];
    expect(findMatchingTransaction(line(), "Amazon.in", existing)).toBeUndefined();
  });

  it("does not match when outside the date tolerance window", () => {
    const existing = [transaction({ date: "2026-01-01" })];
    expect(findMatchingTransaction(line(), "Amazon.in", existing)).toBeUndefined();
  });

  it("does not match when the merchant doesn't appear in the note or merchant name", () => {
    const existing = [transaction({ note: "Payment at Flipkart", merchantName: "Flipkart" })];
    expect(findMatchingTransaction(line(), "Amazon.in", existing)).toBeUndefined();
  });

  it("matches even without a merchant hint, on amount + date alone", () => {
    const existing = [transaction()];
    expect(findMatchingTransaction(line(), undefined, existing)?.id).toBe("t1");
  });
});

describe("toIngestInput", () => {
  function fields(overrides: Partial<ExtractedEmailFields> = {}): ExtractedEmailFields {
    return { subject: "s", sender: "sender@example.com", body: "b", attachments: [], confidence: 1, transactions: [], ...overrides };
  }

  it("builds a 'Payment at <Merchant>' note for a debit line", () => {
    const input = toIngestInput(line(), fields({ merchant: "Amazon.in" }), "receipt");
    expect(input.note).toBe("Payment at Amazon.in");
    expect(input.amount).toBe(799);
    expect(input.date).toBe("2026-07-12");
  });

  it("builds a 'Payment received at <Merchant>' note for a credit line", () => {
    const input = toIngestInput(line({ direction: "credit" }), fields({ merchant: "Amazon.in" }), "refund");
    expect(input.note).toBe("Payment received at Amazon.in");
  });

  it("falls back to the sender when no merchant was extracted", () => {
    const input = toIngestInput(line(), fields({ sender: "noreply@shop.example" }), "receipt");
    expect(input.note).toBe("Payment at noreply@shop.example");
  });

  it("maps payment method by email type, defaulting to Credit Card", () => {
    expect(toIngestInput(line(), fields(), "receipt").paymentMethod).toBe("Credit Card");
    expect(toIngestInput(line(), fields(), "salary-slip").paymentMethod).toBe("Net Banking");
    expect(toIngestInput(line(), fields(), "utility-bill").paymentMethod).toBe("Net Banking");
  });
});
