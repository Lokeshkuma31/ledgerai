import { describe, expect, it } from "vitest";
import { buildTransactionNote, computeTransactionFingerprint, mapPaymentMethod, toIngestInput } from "@/lib/banks/mapper";
import type { BankAccount, RawBankTransaction } from "@/lib/banks/types";

function rawTx(overrides: Partial<RawBankTransaction> = {}): RawBankTransaction {
  return {
    externalId: "ext-1",
    accountId: "acc-1",
    amount: 500,
    direction: "debit",
    currency: "INR",
    description: "Generic transaction",
    postedAt: "2026-07-20",
    pending: false,
    ...overrides,
  };
}

function account(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: "acc-1",
    institution: "Demo Bank A",
    accountName: "Checking",
    accountType: "checking",
    maskedNumber: "XXXX1234",
    currency: "INR",
    balance: 1000,
    availableBalance: 1000,
    lastSynced: null,
    status: "active",
    metadata: {},
    ...overrides,
  };
}

describe("mapPaymentMethod", () => {
  it("maps each account type to the closest core PaymentMethod", () => {
    expect(mapPaymentMethod("checking")).toBe("Net Banking");
    expect(mapPaymentMethod("savings")).toBe("Net Banking");
    expect(mapPaymentMethod("credit-card")).toBe("Credit Card");
    expect(mapPaymentMethod("wallet")).toBe("UPI");
    expect(mapPaymentMethod("cash")).toBe("Cash");
  });

  it("defaults to Net Banking when no account is known", () => {
    expect(mapPaymentMethod(undefined)).toBe("Net Banking");
  });
});

describe("buildTransactionNote", () => {
  it("builds an 'at <merchant>' note the Merchant Intelligence Engine can recognize", () => {
    expect(buildTransactionNote(rawTx({ merchantName: "Amazon", direction: "debit" }))).toBe("Payment at Amazon");
    expect(buildTransactionNote(rawTx({ merchantName: "Employer Inc", direction: "credit" }))).toBe(
      "Payment received at Employer Inc",
    );
  });

  it("falls back to the raw description when there's no merchant name", () => {
    expect(buildTransactionNote(rawTx({ merchantName: undefined, description: "ACH TRANSFER 4821" }))).toBe(
      "ACH TRANSFER 4821",
    );
  });

  it("falls back to a generic label when there's neither a merchant nor a description", () => {
    expect(buildTransactionNote(rawTx({ merchantName: undefined, description: "", direction: "credit" }))).toBe(
      "Bank credit",
    );
  });
});

describe("toIngestInput", () => {
  it("produces a valid IngestInput from a raw transaction + account", () => {
    const input = toIngestInput(rawTx({ merchantName: "Swiggy", amount: 450, postedAt: "2026-07-20" }), account());
    expect(input).toEqual({
      amount: 450,
      note: "Payment at Swiggy",
      paymentMethod: "Net Banking",
      date: "2026-07-20",
    });
  });

  it("uses the account's type to pick a payment method", () => {
    const input = toIngestInput(rawTx({ merchantName: "Myntra" }), account({ accountType: "credit-card" }));
    expect(input.paymentMethod).toBe("Credit Card");
  });
});

describe("computeTransactionFingerprint", () => {
  it("is identical for two calls over the same transaction", () => {
    const a = rawTx();
    const b = rawTx();
    expect(computeTransactionFingerprint(a)).toBe(computeTransactionFingerprint(b));
  });

  it("changes when the amount, pending status, or description changes", () => {
    const base = computeTransactionFingerprint(rawTx());
    expect(computeTransactionFingerprint(rawTx({ amount: 501 }))).not.toBe(base);
    expect(computeTransactionFingerprint(rawTx({ pending: true }))).not.toBe(base);
    expect(computeTransactionFingerprint(rawTx({ description: "Different" }))).not.toBe(base);
  });

  it("does not change when only externalId or accountId differ", () => {
    const base = computeTransactionFingerprint(rawTx());
    expect(computeTransactionFingerprint(rawTx({ externalId: "ext-2", accountId: "acc-2" }))).toBe(base);
  });
});
