import { describe, expect, it } from "vitest";
import {
  computeDuplicateSignature,
  findDuplicateIndices,
  isDuplicateTransaction,
} from "@/plugins/android-sms/matcher";
import type { NormalizedSmsTransaction } from "@/plugins/android-sms/types";

function transaction(overrides: Partial<NormalizedSmsTransaction> = {}): NormalizedSmsTransaction {
  return {
    messageId: "msg-1",
    amount: 100,
    currency: "INR",
    merchant: "Swiggy",
    merchantNormalized: "Swiggy",
    transactionType: "debit",
    paymentMethod: "UPI",
    date: "2026-07-20",
    time: "10:00",
    rawMessage: "raw",
    rawReceivedAt: "2026-07-20T10:00:00Z",
    confidence: 0.9,
    parseNotes: [],
    ...overrides,
  };
}

describe("computeDuplicateSignature", () => {
  it("keys on the reference number when one is present", () => {
    const t = transaction({ referenceNumber: "REF123" });
    expect(computeDuplicateSignature(t)).toBe("ref:ref123");
  });

  it("falls back to date+amount+currency+merchant+method when no reference exists", () => {
    const t = transaction({ referenceNumber: undefined });
    expect(computeDuplicateSignature(t)).toBe("sig|2026-07-20|100.00|INR|swiggy|UPI");
  });
});

describe("isDuplicateTransaction", () => {
  it("flags a reference-number match as a duplicate regardless of timing", () => {
    const candidate = transaction({ referenceNumber: "REF123" });
    const known = [{ signature: "ref:ref123", receivedAt: "2020-01-01T00:00:00Z" }];
    expect(isDuplicateTransaction(candidate, candidate.rawReceivedAt, known)).toBe(true);
  });

  it("flags a fallback-signature match only within the tolerance window", () => {
    const candidate = transaction({ referenceNumber: undefined });
    const closeRecord = [
      { signature: computeDuplicateSignature(candidate), receivedAt: "2026-07-20T10:05:00Z" },
    ];
    const farRecord = [
      { signature: computeDuplicateSignature(candidate), receivedAt: "2026-07-20T12:00:00Z" },
    ];
    expect(isDuplicateTransaction(candidate, candidate.rawReceivedAt, closeRecord, { toleranceMinutes: 15 })).toBe(
      true,
    );
    expect(isDuplicateTransaction(candidate, candidate.rawReceivedAt, farRecord, { toleranceMinutes: 15 })).toBe(
      false,
    );
  });

  it("does not flag two genuinely distinct transactions", () => {
    const candidate = transaction({ amount: 250, merchant: "Zomato", referenceNumber: undefined });
    const known = [{ signature: computeDuplicateSignature(transaction()), receivedAt: candidate.rawReceivedAt }];
    expect(isDuplicateTransaction(candidate, candidate.rawReceivedAt, known)).toBe(false);
  });
});

describe("findDuplicateIndices", () => {
  it("catches a duplicate arriving twice within the same batch", () => {
    const a = transaction({ referenceNumber: undefined });
    const b = transaction({ referenceNumber: undefined });
    const indices = findDuplicateIndices(
      [
        { transaction: a, receivedAt: a.rawReceivedAt },
        { transaction: b, receivedAt: "2026-07-20T10:04:00Z" },
      ],
      [],
    );
    expect(indices.has(1)).toBe(true);
    expect(indices.has(0)).toBe(false);
  });

  it("catches a duplicate against a previously-imported record", () => {
    const candidate = transaction({ referenceNumber: "REF999" });
    const indices = findDuplicateIndices(
      [{ transaction: candidate, receivedAt: candidate.rawReceivedAt }],
      [{ signature: "ref:ref999", receivedAt: "2026-01-01T00:00:00Z" }],
    );
    expect(indices.has(0)).toBe(true);
  });
});
