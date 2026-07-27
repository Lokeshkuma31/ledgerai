import { describe, expect, it } from "vitest";
import {
  normalizeMaskedAccount,
  normalizeMerchantName,
  normalizeTransaction,
  resolveDate,
  resolveTime,
} from "@/plugins/android-sms/normalizer";
import type { ParsedSmsTransaction } from "@/plugins/android-sms/types";

describe("normalizeMerchantName", () => {
  it("title-cases a VPA handle, dropping the bank suffix", () => {
    expect(normalizeMerchantName("amazon@ybl")).toBe("Amazon");
  });

  it("collapses whitespace and strips corporate suffixes", () => {
    expect(normalizeMerchantName("  Uber   India   Pvt Ltd  ")).toBe("Uber India");
  });

  it("keeps an all-caps acronym as-is", () => {
    expect(normalizeMerchantName("BESCOM")).toBe("BESCOM");
  });

  it("replaces dots/underscores with spaces", () => {
    expect(normalizeMerchantName("amazon.pay_services")).toBe("Amazon Pay Services");
  });
});

describe("normalizeMaskedAccount", () => {
  it("formats a raw digit run into XXXX-suffixed display form", () => {
    expect(normalizeMaskedAccount("4321")).toBe("XXXX4321");
  });

  it("pads a shorter digit run", () => {
    expect(normalizeMaskedAccount("12")).toBe("XXXX0012");
  });
});

describe("resolveDate", () => {
  it("converts DD-MM-YYYY to ISO", () => {
    expect(resolveDate("03-07-2026", "2026-01-01T00:00:00Z")).toBe("2026-07-03");
  });

  it("falls back to the message's own timestamp when no date text was found", () => {
    expect(resolveDate("", "2026-07-20T10:00:00Z")).toBe("2026-07-20");
  });
});

describe("resolveTime", () => {
  it("converts 12-hour PM time to 24-hour", () => {
    expect(resolveTime("2:32 PM", "2026-07-20T00:00:00Z")).toBe("14:32");
  });

  it("falls back to the message's own timestamp when no time text was found", () => {
    expect(resolveTime("", "2026-07-20T14:32:00Z")).toBe("14:32");
  });
});

describe("normalizeTransaction", () => {
  function parsed(overrides: Partial<ParsedSmsTransaction> = {}): ParsedSmsTransaction {
    return {
      messageId: "msg-1",
      amount: 100,
      currency: "INR",
      merchant: "swiggy@ybl",
      transactionType: "debit",
      paymentMethod: "UPI",
      maskedAccount: "1234",
      date: "10-05-2026",
      time: "",
      rawMessage: "raw",
      rawReceivedAt: "2026-05-10T09:30:00Z",
      confidence: 0.9,
      parseNotes: [],
      ...overrides,
    };
  }

  it("normalizes merchant, masked account, and date together", () => {
    const normalized = normalizeTransaction(parsed());
    expect(normalized.merchant).toBe("Swiggy");
    expect(normalized.merchantNormalized).toBe("Swiggy");
    expect(normalized.maskedAccount).toBe("XXXX1234");
    expect(normalized.date).toBe("2026-05-10");
  });

  it("leaves merchant null when the parser found none", () => {
    const normalized = normalizeTransaction(parsed({ merchant: undefined }));
    expect(normalized.merchant).toBeUndefined();
    expect(normalized.merchantNormalized).toBeNull();
  });
});
