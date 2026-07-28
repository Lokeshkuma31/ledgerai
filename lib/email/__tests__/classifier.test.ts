import { describe, expect, it } from "vitest";
import { classifyEmail } from "@/lib/email/classifier";
import { MOCK_EMAIL_BODIES } from "@/plugins/gmail/mock-provider";
import type { EmailType } from "@/lib/email/types";

const SUBJECTS: Record<string, string> = {
  "amazon-receipt": "Your Amazon.in Order Confirmation and Receipt",
  "flipkart-invoice": "Invoice for Your Flipkart Order — Bill To You",
  "subscription-renewal": "Your Netflix Subscription Has Been Renewed",
  refund: "Your Refund Has Been Processed",
  "salary-slip": "Your Payslip for July 2026 — Salary Credited",
  "utility-bill": "Your Utility Bill — Electricity Bill for July",
  "credit-card-statement": "Your ICICI Bank Credit Card Statement — Statement Date 2026-07-05",
  "bank-statement": "Your Monthly Account Statement is Ready",
  "flight-booking": "Your IndiGo Flight Booking Confirmation — PNR X7K9QP",
  "hotel-booking": "Your OYO Hotel Reservation Confirmed",
  insurance: "Your LIC Insurance Premium Receipt — Policy Number POL-882134",
  loan: "Your HDFC Bank Loan EMI Statement",
  "investment-report": "Your Monthly Portfolio Report — Mutual Fund Folio Number FOL-337612",
  "tax-document": "Your Form 16 Tax Certificate is Ready",
};

const EXPECTED_TYPES: Record<string, EmailType> = {
  "amazon-receipt": "receipt",
  "flipkart-invoice": "invoice",
  "subscription-renewal": "subscription-renewal",
  refund: "refund",
  "salary-slip": "salary-slip",
  "utility-bill": "utility-bill",
  "credit-card-statement": "credit-card-statement",
  "bank-statement": "bank-statement",
  "flight-booking": "flight-booking",
  "hotel-booking": "hotel-booking",
  insurance: "insurance",
  loan: "loan",
  "investment-report": "investment-report",
  "tax-document": "tax-document",
};

describe("classifyEmail", () => {
  it("classifies every known fixture as its own email type with matched rules", () => {
    for (const key of Object.keys(SUBJECTS)) {
      const result = classifyEmail(SUBJECTS[key], MOCK_EMAIL_BODIES[key]);
      expect(result.type, `fixture "${key}"`).toBe(EXPECTED_TYPES[key]);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.matchedRules.length).toBeGreaterThan(0);
    }
  });

  it("returns unknown with zero confidence for a non-financial email", () => {
    const result = classifyEmail("Foodblog Weekly Newsletter", MOCK_EMAIL_BODIES.unknown);
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("returns unknown for empty subject and body", () => {
    const result = classifyEmail("", "");
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("classifies a weakly-worded receipt email as receipt with low confidence", () => {
    const result = classifyEmail("Receipt from QuickMart", MOCK_EMAIL_BODIES.malformed);
    expect(result.type).toBe("receipt");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
