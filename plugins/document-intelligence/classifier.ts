/**
 * Document Classifier — deterministic, rule-based keyword scoring. No
 * LLM, no ML model: every document type has a fixed list of weighted
 * keyword/phrase rules; the type whose rules match the most cumulative
 * weight wins. A document matching nothing scores 0 for every type and is
 * classified "unknown" rather than guessed at.
 */
import { DOCUMENT_TYPES, type ClassificationResult, type DocumentType } from "@/plugins/document-intelligence/types";

interface Rule {
  type: Exclude<DocumentType, "unknown">;
  pattern: RegExp;
  weight: number;
  label: string;
}

const RULES: Rule[] = [
  // Receipt
  { type: "receipt", pattern: /\breceipt\b/i, weight: 2, label: "contains 'receipt'" },
  { type: "receipt", pattern: /\bsubtotal\b/i, weight: 1, label: "contains 'subtotal'" },
  { type: "receipt", pattern: /\bthank you for shopping\b/i, weight: 2, label: "contains 'thank you for shopping'" },
  { type: "receipt", pattern: /\bcashier\b/i, weight: 1, label: "contains 'cashier'" },

  // Invoice
  { type: "invoice", pattern: /\binvoice\b/i, weight: 3, label: "contains 'invoice'" },
  { type: "invoice", pattern: /\binvoice number\b/i, weight: 2, label: "contains 'invoice number'" },
  { type: "invoice", pattern: /\bbill to\b/i, weight: 2, label: "contains 'bill to'" },
  { type: "invoice", pattern: /\bdue date\b/i, weight: 1, label: "contains 'due date'" },

  // Bank Statement
  { type: "bank-statement", pattern: /\bstatement of account\b/i, weight: 3, label: "contains 'statement of account'" },
  { type: "bank-statement", pattern: /\bopening balance\b/i, weight: 2, label: "contains 'opening balance'" },
  { type: "bank-statement", pattern: /\bclosing balance\b/i, weight: 2, label: "contains 'closing balance'" },
  { type: "bank-statement", pattern: /\baccount number\b/i, weight: 1, label: "contains 'account number'" },

  // Credit Card Statement
  { type: "credit-card-statement", pattern: /\bcredit card statement\b/i, weight: 3, label: "contains 'credit card statement'" },
  { type: "credit-card-statement", pattern: /\bcredit limit\b/i, weight: 2, label: "contains 'credit limit'" },
  { type: "credit-card-statement", pattern: /\bminimum payment due\b/i, weight: 2, label: "contains 'minimum payment due'" },
  { type: "credit-card-statement", pattern: /\bcard number\b/i, weight: 1, label: "contains 'card number'" },

  // Utility Bill
  { type: "utility-bill", pattern: /\butility bill\b/i, weight: 3, label: "contains 'utility bill'" },
  { type: "utility-bill", pattern: /\bmeter reading\b/i, weight: 2, label: "contains 'meter reading'" },
  { type: "utility-bill", pattern: /\belectricity\b/i, weight: 1, label: "contains 'electricity'" },
  { type: "utility-bill", pattern: /\bamount due\b/i, weight: 1, label: "contains 'amount due'" },

  // Salary Slip
  { type: "salary-slip", pattern: /\bpayslip\b/i, weight: 3, label: "contains 'payslip'" },
  { type: "salary-slip", pattern: /\bgross pay\b/i, weight: 2, label: "contains 'gross pay'" },
  { type: "salary-slip", pattern: /\bnet pay\b/i, weight: 2, label: "contains 'net pay'" },
  { type: "salary-slip", pattern: /\bemployee id\b/i, weight: 1, label: "contains 'employee id'" },

  // Insurance Receipt
  { type: "insurance-receipt", pattern: /\bpremium payment receipt\b/i, weight: 3, label: "contains 'premium payment receipt'" },
  { type: "insurance-receipt", pattern: /\bpolicy number\b/i, weight: 2, label: "contains 'policy number'" },
  { type: "insurance-receipt", pattern: /\bsum assured\b/i, weight: 2, label: "contains 'sum assured'" },
  { type: "insurance-receipt", pattern: /\bpremium amount\b/i, weight: 1, label: "contains 'premium amount'" },

  // Investment Statement
  { type: "investment-statement", pattern: /\bportfolio statement\b/i, weight: 3, label: "contains 'portfolio statement'" },
  { type: "investment-statement", pattern: /\bfolio number\b/i, weight: 2, label: "contains 'folio number'" },
  { type: "investment-statement", pattern: /\bunits held\b/i, weight: 2, label: "contains 'units held'" },
  { type: "investment-statement", pattern: /\bnav\b/i, weight: 1, label: "contains 'NAV'" },

  // Loan Statement
  { type: "loan-statement", pattern: /\bloan account\b/i, weight: 2, label: "contains 'loan account'" },
  { type: "loan-statement", pattern: /\bemi amount\b/i, weight: 2, label: "contains 'EMI amount'" },
  { type: "loan-statement", pattern: /\bprincipal outstanding\b/i, weight: 2, label: "contains 'principal outstanding'" },
  { type: "loan-statement", pattern: /\binterest rate\b/i, weight: 1, label: "contains 'interest rate'" },
];

const KNOWN_TYPES = DOCUMENT_TYPES.filter((t): t is Exclude<DocumentType, "unknown"> => t !== "unknown");

/** Sum of every rule's weight for a type — the denominator confidence is
 * normalized against, so a document matching every keyword for its type
 * scores 1.0 regardless of how many rules that type happens to have. */
function totalWeightFor(type: Exclude<DocumentType, "unknown">): number {
  return RULES.filter((r) => r.type === type).reduce((sum, r) => sum + r.weight, 0);
}

export function classifyDocument(text: string): ClassificationResult {
  const scores = new Map<Exclude<DocumentType, "unknown">, { weight: number; matched: string[] }>();
  for (const type of KNOWN_TYPES) scores.set(type, { weight: 0, matched: [] });

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    const entry = scores.get(rule.type)!;
    entry.weight += rule.weight;
    entry.matched.push(rule.label);
  }

  let winner: Exclude<DocumentType, "unknown"> | null = null;
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
