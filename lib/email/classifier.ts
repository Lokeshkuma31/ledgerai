/**
 * Financial Email Classifier — deterministic, weighted-keyword scoring
 * over an email's subject + body text. No LLM, no ML model — mirrors
 * plugins/document-intelligence/classifier.ts's approach exactly, applied
 * to email language instead of document language. An email matching
 * nothing scores 0 for every type and is classified "unknown".
 */
import { EMAIL_TYPES, type EmailClassification, type EmailType } from "@/lib/email/types";

interface Rule {
  type: Exclude<EmailType, "unknown">;
  pattern: RegExp;
  weight: number;
  label: string;
}

const RULES: Rule[] = [
  // Receipt
  { type: "receipt", pattern: /\border confirmation\b/i, weight: 3, label: "contains 'order confirmation'" },
  { type: "receipt", pattern: /\byour receipt\b/i, weight: 2, label: "contains 'your receipt'" },
  { type: "receipt", pattern: /\bthank you for your (order|purchase)\b/i, weight: 2, label: "contains 'thank you for your order/purchase'" },
  { type: "receipt", pattern: /\bhas been delivered\b/i, weight: 1, label: "contains 'has been delivered'" },

  // Invoice
  { type: "invoice", pattern: /\binvoice\b/i, weight: 3, label: "contains 'invoice'" },
  { type: "invoice", pattern: /\binvoice number\b/i, weight: 2, label: "contains 'invoice number'" },
  { type: "invoice", pattern: /\bbill to\b/i, weight: 2, label: "contains 'bill to'" },
  { type: "invoice", pattern: /\bgst\b/i, weight: 1, label: "contains 'GST'" },

  // Subscription Renewal
  { type: "subscription-renewal", pattern: /\bsubscription\b/i, weight: 2, label: "contains 'subscription'" },
  { type: "subscription-renewal", pattern: /\brenewed\b/i, weight: 2, label: "contains 'renewed'" },
  { type: "subscription-renewal", pattern: /\brenewal\b/i, weight: 2, label: "contains 'renewal'" },
  { type: "subscription-renewal", pattern: /\bnext billing date\b/i, weight: 2, label: "contains 'next billing date'" },

  // Refund
  { type: "refund", pattern: /\brefund(ed)?\b/i, weight: 3, label: "contains 'refund(ed)'" },
  { type: "refund", pattern: /\bmoney back\b/i, weight: 2, label: "contains 'money back'" },
  { type: "refund", pattern: /\breturn processed\b/i, weight: 1, label: "contains 'return processed'" },

  // Salary Slip
  { type: "salary-slip", pattern: /\bpayslip\b/i, weight: 3, label: "contains 'payslip'" },
  { type: "salary-slip", pattern: /\bgross pay\b/i, weight: 2, label: "contains 'gross pay'" },
  { type: "salary-slip", pattern: /\bnet pay\b/i, weight: 2, label: "contains 'net pay'" },
  { type: "salary-slip", pattern: /\bsalary\b/i, weight: 1, label: "contains 'salary'" },

  // Utility Bill
  { type: "utility-bill", pattern: /\butility bill\b/i, weight: 3, label: "contains 'utility bill'" },
  { type: "utility-bill", pattern: /\belectricity bill\b/i, weight: 2, label: "contains 'electricity bill'" },
  { type: "utility-bill", pattern: /\bmeter reading\b/i, weight: 2, label: "contains 'meter reading'" },
  { type: "utility-bill", pattern: /\bamount due\b/i, weight: 1, label: "contains 'amount due'" },

  // Credit Card Statement
  { type: "credit-card-statement", pattern: /\bcredit card statement\b/i, weight: 3, label: "contains 'credit card statement'" },
  { type: "credit-card-statement", pattern: /\bminimum payment due\b/i, weight: 2, label: "contains 'minimum payment due'" },
  { type: "credit-card-statement", pattern: /\bstatement date\b/i, weight: 1, label: "contains 'statement date'" },
  { type: "credit-card-statement", pattern: /\bcard ending\b/i, weight: 1, label: "contains 'card ending'" },

  // Bank Statement
  { type: "bank-statement", pattern: /\baccount statement\b/i, weight: 3, label: "contains 'account statement'" },
  { type: "bank-statement", pattern: /\bopening balance\b/i, weight: 2, label: "contains 'opening balance'" },
  { type: "bank-statement", pattern: /\bclosing balance\b/i, weight: 2, label: "contains 'closing balance'" },

  // Flight Booking
  { type: "flight-booking", pattern: /\bflight\b/i, weight: 2, label: "contains 'flight'" },
  { type: "flight-booking", pattern: /\bbooking confirmation\b/i, weight: 2, label: "contains 'booking confirmation'" },
  { type: "flight-booking", pattern: /\bpnr\b/i, weight: 3, label: "contains 'PNR'" },
  { type: "flight-booking", pattern: /\bboarding\b/i, weight: 1, label: "contains 'boarding'" },

  // Hotel Booking
  { type: "hotel-booking", pattern: /\bhotel\b/i, weight: 2, label: "contains 'hotel'" },
  { type: "hotel-booking", pattern: /\breservation confirmed\b/i, weight: 3, label: "contains 'reservation confirmed'" },
  { type: "hotel-booking", pattern: /\bcheck-in\b/i, weight: 1, label: "contains 'check-in'" },
  { type: "hotel-booking", pattern: /\bcheck-out\b/i, weight: 1, label: "contains 'check-out'" },

  // Insurance
  { type: "insurance", pattern: /\binsurance\b/i, weight: 2, label: "contains 'insurance'" },
  { type: "insurance", pattern: /\bpremium\b/i, weight: 2, label: "contains 'premium'" },
  { type: "insurance", pattern: /\bpolicy number\b/i, weight: 3, label: "contains 'policy number'" },
  { type: "insurance", pattern: /\bsum assured\b/i, weight: 1, label: "contains 'sum assured'" },

  // Loan
  { type: "loan", pattern: /\bloan\b/i, weight: 2, label: "contains 'loan'" },
  { type: "loan", pattern: /\bemi\b/i, weight: 3, label: "contains 'EMI'" },
  { type: "loan", pattern: /\bprincipal outstanding\b/i, weight: 2, label: "contains 'principal outstanding'" },
  { type: "loan", pattern: /\binterest rate\b/i, weight: 1, label: "contains 'interest rate'" },

  // Investment Report
  { type: "investment-report", pattern: /\bportfolio\b/i, weight: 2, label: "contains 'portfolio'" },
  { type: "investment-report", pattern: /\bfolio number\b/i, weight: 3, label: "contains 'folio number'" },
  { type: "investment-report", pattern: /\bnav\b/i, weight: 1, label: "contains 'NAV'" },
  { type: "investment-report", pattern: /\bmutual fund\b/i, weight: 2, label: "contains 'mutual fund'" },

  // Tax Document
  { type: "tax-document", pattern: /\bform 16\b/i, weight: 3, label: "contains 'Form 16'" },
  { type: "tax-document", pattern: /\btax certificate\b/i, weight: 2, label: "contains 'tax certificate'" },
  { type: "tax-document", pattern: /\btds\b/i, weight: 2, label: "contains 'TDS'" },
  { type: "tax-document", pattern: /\bassessment year\b/i, weight: 1, label: "contains 'assessment year'" },
];

const KNOWN_TYPES = EMAIL_TYPES.filter((t): t is Exclude<EmailType, "unknown"> => t !== "unknown");

function totalWeightFor(type: Exclude<EmailType, "unknown">): number {
  return RULES.filter((r) => r.type === type).reduce((sum, r) => sum + r.weight, 0);
}

/** Classifies over subject + body combined — a receipt's strongest signal
 * is often in the subject line ("Your order has been delivered"), while
 * amount/reference details live in the body. */
export function classifyEmail(subject: string, body: string): EmailClassification {
  const text = `${subject}\n${body}`;
  const scores = new Map<Exclude<EmailType, "unknown">, { weight: number; matched: string[] }>();
  for (const type of KNOWN_TYPES) scores.set(type, { weight: 0, matched: [] });

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    const entry = scores.get(rule.type)!;
    entry.weight += rule.weight;
    entry.matched.push(rule.label);
  }

  let winner: Exclude<EmailType, "unknown"> | null = null;
  let winnerScore = 0;
  for (const type of KNOWN_TYPES) {
    const { weight } = scores.get(type)!;
    if (weight > winnerScore) {
      winner = type;
      winnerScore = weight;
    }
  }

  if (!winner || winnerScore === 0) {
    return { type: "unknown", confidence: 0, matchedRules: [] };
  }

  const { matched } = scores.get(winner)!;
  const confidence = Math.min(1, winnerScore / totalWeightFor(winner));
  return { type: winner, confidence, matchedRules: matched };
}
