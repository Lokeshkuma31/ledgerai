/**
 * Parser Selection + per-type Structured Field Extraction. Every parser is
 * a pure function: raw OCR text in, a fixed subset of ExtractedFields out
 * — regex/line-scanning only, no LLM, no network. engine.ts is the only
 * caller; it fills in `rawText`/`confidence` afterward since those aren't
 * this module's concern.
 */
import type { DocumentType, ExtractedFields, ExtractedTransactionLine, StatementPeriod } from "@/plugins/document-intelligence/types";

type ParsedFields = Omit<ExtractedFields, "rawText" | "confidence">;

// --- generic line/label scanning helpers ------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstLineStartingWith(text: string, label: string): string | undefined {
  const regex = new RegExp(`^\\s*${escapeRegExp(label)}.*$`, "im");
  return regex.exec(text)?.[0]?.trim();
}

function lastAmountOnLine(line: string | undefined): number | undefined {
  if (!line) return undefined;
  const matches = line.match(/[\d,]+\.\d{2}/g);
  if (!matches || matches.length === 0) return undefined;
  const n = Number(matches[matches.length - 1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function amountAfterLabel(text: string, label: string): number | undefined {
  return lastAmountOnLine(firstLineStartingWith(text, label));
}

function valueAfterColon(text: string, label: string): string | undefined {
  const line = firstLineStartingWith(text, label);
  if (!line) return undefined;
  const idx = line.indexOf(":");
  if (idx === -1) return undefined;
  const value = line.slice(idx + 1).trim();
  return value.length > 0 ? value : undefined;
}

function dateAfterLabel(text: string, label: string): string | undefined {
  const line = firstLineStartingWith(text, label);
  if (!line) return undefined;
  return /(\d{4}-\d{2}-\d{2})/.exec(line)?.[1];
}

function periodAfterLabel(text: string, label: string): StatementPeriod | undefined {
  const regex = new RegExp(`${escapeRegExp(label)}:\\s*(\\d{4}-\\d{2}-\\d{2})\\s*to\\s*(\\d{4}-\\d{2}-\\d{2})`, "i");
  const m = regex.exec(text);
  return m ? { start: m[1], end: m[2] } : undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
}

function firstDateAnywhere(text: string): string | undefined {
  return /(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
}

/** A scanned page can contain more than one document back to back — see
 * mock-documents.ts's "multiple-receipts" fixture. A single document
 * splits into one block. */
function splitBlocks(text: string): string[] {
  const blocks = text
    .split(/---\s*PAGE BREAK\s*---/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  return blocks.length > 0 ? blocks : [text];
}

/** Bank/credit-card statement transaction rows: "YYYY-MM-DD  Description  1234.56".
 * Direction is inferred from the description, since the mock fixtures don't
 * carry a reliable positional debit/credit column to parse. */
function parseTransactionTable(text: string): ExtractedTransactionLine[] {
  const rows: ExtractedTransactionLine[] = [];
  const regex = /^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const [, date, description, amountText] = match;
    rows.push({
      date,
      description: description.trim(),
      amount: Number(amountText.replace(/,/g, "")),
      direction: /credit|salary|interest|refund/i.test(description) ? "credit" : "debit",
    });
  }
  return rows;
}

// --- per-type parsers --------------------------------------------------------

function parseReceipt(text: string): ParsedFields {
  const blocks = splitBlocks(text).map((block) => ({
    merchant: firstNonEmptyLine(block),
    receiptNumber: /Receipt\s*#\s*([A-Za-z0-9-]+)/i.exec(block)?.[1],
    issueDate: dateAfterLabel(block, "Date"),
    paymentMethod: valueAfterColon(block, "Payment Method"),
    subtotal: amountAfterLabel(block, "Subtotal"),
    tax: amountAfterLabel(block, "Tax"),
    discount: amountAfterLabel(block, "Discount"),
    total: amountAfterLabel(block, "Total"),
  }));

  const primary = blocks[0];
  const transactions: ExtractedTransactionLine[] = blocks
    .filter((b) => b.total !== undefined)
    .map((b) => ({
      description: b.merchant ?? "Receipt purchase",
      amount: b.total!,
      date: b.issueDate ?? "",
      direction: "debit",
    }));

  return {
    merchant: primary.merchant,
    amount: primary.subtotal,
    tax: primary.tax,
    discount: primary.discount,
    total: primary.total,
    receiptNumber: primary.receiptNumber,
    paymentMethod: primary.paymentMethod,
    issueDate: primary.issueDate,
    currency: "INR",
    transactions,
  };
}

function parseInvoice(text: string): ParsedFields {
  const merchant = firstNonEmptyLine(text);
  const issueDate = dateAfterLabel(text, "Issue Date");
  const total = amountAfterLabel(text, "Total");
  return {
    merchant,
    tax: amountAfterLabel(text, "Tax"),
    total,
    invoiceNumber: valueAfterColon(text, "Invoice Number"),
    paymentMethod: valueAfterColon(text, "Payment Method"),
    referenceNumber: valueAfterColon(text, "Reference Number"),
    dueDate: dateAfterLabel(text, "Due Date"),
    issueDate,
    currency: "INR",
    transactions:
      total !== undefined
        ? [{ description: merchant ? `Invoice from ${merchant}` : "Invoice payment", amount: total, date: issueDate ?? "", direction: "debit" }]
        : [],
  };
}

function parseBankStatement(text: string): ParsedFields {
  return {
    accountNumber: valueAfterColon(text, "Account Number"),
    statementPeriod: periodAfterLabel(text, "Statement Period"),
    balance: amountAfterLabel(text, "Closing Balance"),
    currency: "INR",
    transactions: parseTransactionTable(text),
  };
}

function parseCreditCardStatement(text: string): ParsedFields {
  return {
    accountNumber: valueAfterColon(text, "Card Number"),
    statementPeriod: periodAfterLabel(text, "Statement Period"),
    balance: amountAfterLabel(text, "Total Due"),
    dueDate: dateAfterLabel(text, "Due Date"),
    currency: "INR",
    transactions: parseTransactionTable(text),
  };
}

function parseUtilityBill(text: string): ParsedFields {
  const merchant = firstNonEmptyLine(text);
  const total = amountAfterLabel(text, "Amount Due");
  const dueDate = dateAfterLabel(text, "Due Date");
  return {
    merchant,
    accountNumber: valueAfterColon(text, "Account Number"),
    issueDate: dateAfterLabel(text, "Bill Date"),
    dueDate,
    total,
    paymentMethod: valueAfterColon(text, "Payment Method"),
    referenceNumber: valueAfterColon(text, "Reference Number"),
    currency: "INR",
    transactions:
      total !== undefined
        ? [{ description: merchant ? `${merchant} payment` : "Utility bill payment", amount: total, date: dueDate ?? "", direction: "debit" }]
        : [],
  };
}

function parseSalarySlip(text: string): ParsedFields {
  const merchant = firstNonEmptyLine(text);
  const period = periodAfterLabel(text, "Pay Period");
  const netPay = amountAfterLabel(text, "Net Pay");
  return {
    merchant,
    amount: amountAfterLabel(text, "Gross Pay"),
    tax: amountAfterLabel(text, "Total Deductions"),
    total: netPay,
    statementPeriod: period,
    currency: "INR",
    transactions:
      netPay !== undefined
        ? [{ description: merchant ? `Salary from ${merchant}` : "Salary credited", amount: netPay, date: period?.end ?? "", direction: "credit" }]
        : [],
  };
}

function parseInsuranceReceipt(text: string): ParsedFields {
  const merchant = firstNonEmptyLine(text);
  const issueDate = dateAfterLabel(text, "Payment Date");
  const total = amountAfterLabel(text, "Premium Amount");
  return {
    merchant,
    receiptNumber: valueAfterColon(text, "Receipt Number"),
    referenceNumber: valueAfterColon(text, "Policy Number"),
    issueDate,
    total,
    paymentMethod: valueAfterColon(text, "Payment Method"),
    currency: "INR",
    transactions:
      total !== undefined
        ? [{ description: merchant ? `${merchant} premium payment` : "Insurance premium payment", amount: total, date: issueDate ?? "", direction: "debit" }]
        : [],
  };
}

function parseInvestmentStatement(text: string): ParsedFields {
  return {
    merchant: firstNonEmptyLine(text),
    referenceNumber: valueAfterColon(text, "Folio Number"),
    statementPeriod: periodAfterLabel(text, "Statement Period"),
    balance: amountAfterLabel(text, "Portfolio Value"),
    currency: "INR",
    transactions: [],
  };
}

function parseLoanStatement(text: string): ParsedFields {
  const merchant = firstNonEmptyLine(text);
  const dueDate = dateAfterLabel(text, "Due Date");
  const emiAmount = amountAfterLabel(text, "EMI Amount");
  return {
    merchant,
    accountNumber: valueAfterColon(text, "Loan Account Number"),
    statementPeriod: periodAfterLabel(text, "Statement Period"),
    amount: emiAmount,
    balance: amountAfterLabel(text, "Principal Outstanding"),
    dueDate,
    currency: "INR",
    transactions:
      emiAmount !== undefined
        ? [{ description: merchant ? `${merchant} EMI payment` : "Loan EMI payment", amount: emiAmount, date: dueDate ?? "", direction: "debit" }]
        : [],
  };
}

/** Best-effort fallback for "unknown" (or any type without a dedicated
 * parser) — never assumes a specific layout, so it usually comes back
 * mostly empty, which is the correct outcome for an unrecognized document. */
function parseGeneric(text: string): ParsedFields {
  const total = amountAfterLabel(text, "Total") ?? amountAfterLabel(text, "Amount") ?? amountAfterLabel(text, "Balance");
  return {
    merchant: firstNonEmptyLine(text),
    total,
    issueDate: firstDateAnywhere(text),
    currency: "INR",
    transactions: [],
  };
}

const PARSERS: Record<Exclude<DocumentType, "unknown">, (text: string) => ParsedFields> = {
  receipt: parseReceipt,
  invoice: parseInvoice,
  "bank-statement": parseBankStatement,
  "credit-card-statement": parseCreditCardStatement,
  "utility-bill": parseUtilityBill,
  "salary-slip": parseSalarySlip,
  "insurance-receipt": parseInsuranceReceipt,
  "investment-statement": parseInvestmentStatement,
  "loan-statement": parseLoanStatement,
};

export function getParser(type: DocumentType): (text: string) => ParsedFields {
  return type === "unknown" ? parseGeneric : PARSERS[type];
}
