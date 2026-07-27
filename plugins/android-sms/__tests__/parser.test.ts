import { describe, expect, it } from "vitest";
import { parseMessage } from "@/plugins/android-sms/parser";
import type { RawSmsMessage } from "@/plugins/android-sms/types";

function message(body: string, overrides: Partial<RawSmsMessage> = {}): RawSmsMessage {
  return {
    id: "test-msg",
    sender: "TESTBK",
    channel: "sms",
    sourceType: "bank-sms",
    body,
    receivedAt: "2026-07-20T10:00:00Z",
    ...overrides,
  };
}

describe("parseMessage", () => {
  it("successfully parses a UPI payment (spec example)", () => {
    const outcome = parseMessage(message("₹450.00 paid to Swiggy using UPI."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.amount).toBe(450);
    expect(outcome.transaction.currency).toBe("INR");
    expect(outcome.transaction.merchant).toBe("Swiggy");
    expect(outcome.transaction.transactionType).toBe("debit");
    expect(outcome.transaction.paymentMethod).toBe("UPI");
    expect(outcome.transaction.confidence).toBeGreaterThan(0.7);
  });

  it("successfully parses a card transaction (spec example)", () => {
    const outcome = parseMessage(message("Your card ending 4321 was used for $85.50 at Amazon."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.amount).toBe(85.5);
    expect(outcome.transaction.currency).toBe("USD");
    expect(outcome.transaction.merchant).toBe("Amazon");
    expect(outcome.transaction.maskedAccount).toBe("4321");
  });

  it("parses a generic bank debit with no identifiable merchant (Unknown Merchant)", () => {
    const outcome = parseMessage(message("Rs.1,250.00 debited from A/c XX2211 on 08-07-2026. Avl Bal Rs.9,800.00"));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.merchant).toBeUndefined();
    expect(outcome.transaction.transactionType).toBe("debit");
    // Confidence is penalized for the missing merchant.
    expect(outcome.transaction.confidence).toBeLessThan(0.68);
  });

  it("parses a refund and identifies the originating merchant", () => {
    const outcome = parseMessage(message("₹250.00 refunded for your Swiggy order. Order ID SWGY998877."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.transactionType).toBe("refund");
    expect(outcome.transaction.merchant).toBe("Swiggy");
    expect(outcome.transaction.referenceNumber).toBe("SWGY998877");
  });

  it("parses a salary credit (spec example)", () => {
    const outcome = parseMessage(message("Salary of $4,500 credited."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.transactionType).toBe("credit");
    expect(outcome.transaction.merchant).toBe("Salary");
    expect(outcome.transaction.amount).toBe(4500);
    expect(outcome.transaction.currency).toBe("USD");
  });

  it("parses a transfer (spec example)", () => {
    const outcome = parseMessage(message("$800 transferred to John."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.transactionType).toBe("transfer");
    expect(outcome.transaction.merchant).toBe("John");
  });

  it("parses an ATM cash withdrawal (spec example)", () => {
    const outcome = parseMessage(message("$100 withdrawn from ATM."));
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.transactionType).toBe("cash-withdrawal");
    expect(outcome.transaction.paymentMethod).toBe("Cash");
  });

  it("parses a failed/declined transaction", () => {
    const outcome = parseMessage(
      message("Your transaction of Rs.500.00 to Swiggy has failed. Amount will be reversed within 3-5 business days."),
    );
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.transactionType).toBe("failed");
    expect(outcome.transaction.merchant).toBe("Swiggy");
  });

  it("reports a malformed message (no amount at all) as malformed, not a crash", () => {
    const outcome = parseMessage(message("123456 is your OTP for login. Do not share this with anyone."));
    expect(outcome.status).toBe("malformed");
    if (outcome.status === "parsed") throw new Error("expected malformed");
    expect(outcome.failure.reason).toMatch(/no amount/i);
  });

  it("reports a financial-looking but unsupported message format", () => {
    const outcome = parseMessage(message("You bought 0.001 BTC for $45.00 on CoinDCX."));
    expect(outcome.status).toBe("unknown-format");
    if (outcome.status === "parsed") throw new Error("expected unknown-format");
    expect(outcome.failure.reason).toMatch(/doesn't match/i);
  });

  it("extracts a masked account and balance from a full bank-style SMS", () => {
    const outcome = parseMessage(
      message("Rs.5,000.00 debited from A/c XX1234 on 03-07-2026 to VPA amazon@ybl. Avl Bal Rs.45,230.10"),
    );
    expect(outcome.status).toBe("parsed");
    if (outcome.status !== "parsed") throw new Error("expected parsed");
    expect(outcome.transaction.maskedAccount).toBe("1234");
    expect(outcome.transaction.balance).toBe(45230.1);
    expect(outcome.transaction.merchant).toBe("amazon");
    expect(outcome.transaction.date).toBe("03-07-2026");
  });

  it("never throws on empty or garbage input", () => {
    expect(() => parseMessage(message(""))).not.toThrow();
    expect(() => parseMessage(message("???####!!!!"))).not.toThrow();
  });
});
