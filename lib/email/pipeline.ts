/**
 * Pipeline — executes Financial Email Classification, Attachment
 * Detection, Body Parsing / Structured Extraction, Validation, and
 * Duplicate Detection over one RawEmail. No storage/ingestion/workflow
 * side effects here — engine.ts owns everything from Transaction Mapping
 * onward, exactly the split plugins/document-intelligence/engine.ts (pure
 * analysis) vs. pipeline.ts (orchestration with side effects) uses, just
 * with the names swapped to match this milestone's requested file list.
 */
import { isValidDate } from "@/lib/ingestion/pipeline";
import { classifyEmail } from "@/lib/email/classifier";
import { findDuplicateEmail } from "@/lib/email/registry";
import {
  EMAIL_TYPES,
  type EmailAttachmentMeta,
  type EmailClassification,
  type EmailRecord,
  type EmailType,
  type EmailValidationError,
  type ExtractedEmailFields,
  type ExtractedEmailTransactionLine,
  type RawEmail,
  type StatementPeriod,
} from "@/lib/email/types";

// --- generic label scanning helpers (mirrors plugins/document-intelligence/parsers.ts) ---

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

// --- Body Parser / Structured Extraction (per type) --------------------------

interface BodyFields {
  merchant?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  referenceNumber?: string;
  dueDate?: string;
  statementPeriod?: StatementPeriod;
  transactions: ExtractedEmailTransactionLine[];
}

function line(description: string | undefined, amount: number | undefined, date: string, direction: "debit" | "credit"): ExtractedEmailTransactionLine[] {
  return amount === undefined ? [] : [{ description: description ?? "Email transaction", amount, date, direction }];
}

function extractBody(type: EmailType, body: string, receivedAtDate: string): BodyFields {
  const merchant = firstNonEmptyLine(body);
  const fallbackDate = dateAfterLabel(body, "Date") ?? receivedAtDate;

  switch (type) {
    case "receipt": {
      const amount = amountAfterLabel(body, "Total");
      return { merchant, amount, currency: "INR", referenceNumber: valueAfterColon(body, "Order ID"), transactions: line(merchant, amount, fallbackDate, "debit") };
    }
    case "invoice": {
      const amount = amountAfterLabel(body, "Total");
      return {
        merchant,
        amount,
        currency: "INR",
        invoiceNumber: valueAfterColon(body, "Invoice Number"),
        dueDate: dateAfterLabel(body, "Due Date"),
        referenceNumber: valueAfterColon(body, "Reference Number"),
        transactions: line(merchant, amount, fallbackDate, "debit"),
      };
    }
    case "subscription-renewal": {
      const amount = amountAfterLabel(body, "Amount Charged");
      return {
        merchant,
        amount,
        currency: "INR",
        referenceNumber: valueAfterColon(body, "Subscription ID"),
        dueDate: dateAfterLabel(body, "Next Billing Date"),
        transactions: line(merchant, amount, fallbackDate, "debit"),
      };
    }
    case "refund": {
      const amount = amountAfterLabel(body, "Refund Amount");
      return { merchant, amount, currency: "INR", referenceNumber: valueAfterColon(body, "Order ID"), transactions: line(merchant, amount, fallbackDate, "credit") };
    }
    case "salary-slip": {
      const amount = amountAfterLabel(body, "Net Pay");
      return { merchant, amount, currency: "INR", statementPeriod: periodAfterLabel(body, "Pay Period"), transactions: line(merchant, amount, fallbackDate, "credit") };
    }
    case "utility-bill": {
      const amount = amountAfterLabel(body, "Amount Due");
      const dueDate = dateAfterLabel(body, "Due Date");
      return { merchant, amount, currency: "INR", dueDate, transactions: line(merchant, amount, dueDate ?? fallbackDate, "debit") };
    }
    case "credit-card-statement": {
      return {
        merchant,
        amount: amountAfterLabel(body, "Total Due"),
        currency: "INR",
        statementPeriod: periodAfterLabel(body, "Statement Period"),
        dueDate: dateAfterLabel(body, "Due Date"),
        transactions: [], // line items live on the attached statement's own DocumentRecord
      };
    }
    case "bank-statement": {
      return { merchant, currency: "INR", statementPeriod: periodAfterLabel(body, "Statement Period"), transactions: [] };
    }
    case "flight-booking": {
      const amount = amountAfterLabel(body, "Total Fare");
      return { merchant, amount, currency: "INR", referenceNumber: valueAfterColon(body, "PNR"), transactions: line(merchant, amount, fallbackDate, "debit") };
    }
    case "hotel-booking": {
      const amount = amountAfterLabel(body, "Total Amount");
      return { merchant, amount, currency: "INR", referenceNumber: valueAfterColon(body, "Booking ID"), transactions: line(merchant, amount, fallbackDate, "debit") };
    }
    case "insurance": {
      const amount = amountAfterLabel(body, "Premium Amount");
      return { merchant, amount, currency: "INR", referenceNumber: valueAfterColon(body, "Policy Number"), transactions: line(merchant, amount, fallbackDate, "debit") };
    }
    case "loan": {
      const amount = amountAfterLabel(body, "EMI Amount");
      const dueDate = dateAfterLabel(body, "Due Date");
      return { merchant, amount, currency: "INR", dueDate, statementPeriod: periodAfterLabel(body, "Statement Period"), transactions: line(merchant, amount, dueDate ?? fallbackDate, "debit") };
    }
    case "investment-report": {
      return { merchant, currency: "INR", referenceNumber: valueAfterColon(body, "Folio Number"), statementPeriod: periodAfterLabel(body, "Statement Period"), transactions: [] };
    }
    case "tax-document": {
      return { merchant, referenceNumber: valueAfterColon(body, "Reference Number"), transactions: [] };
    }
    case "unknown":
    default: {
      const amount = amountAfterLabel(body, "Total") ?? amountAfterLabel(body, "Amount");
      return { merchant, amount, currency: amount !== undefined ? "INR" : undefined, transactions: [] };
    }
  }
}

// --- Validation ----------------------------------------------------------------

const KNOWN_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "JPY", "SGD"];

const AMOUNT_NOT_REQUIRED: EmailType[] = ["bank-statement", "investment-report", "tax-document", "unknown"];

const REQUIRED_FIELDS_BY_TYPE: Partial<Record<EmailType, (keyof BodyFields)[]>> = {
  invoice: ["invoiceNumber"],
  "credit-card-statement": ["statementPeriod"],
  "bank-statement": ["statementPeriod"],
  "investment-report": ["statementPeriod"],
  loan: ["statementPeriod"],
  "flight-booking": ["referenceNumber"],
  "hotel-booking": ["referenceNumber"],
  insurance: ["referenceNumber"],
  "tax-document": ["referenceNumber"],
};

export function validateEmailFields(type: EmailType, body: string, fields: ExtractedEmailFields | BodyFields): EmailValidationError[] {
  if (body.trim().length === 0) {
    return [{ code: "malformed-email", message: "This email has no body content to parse." }];
  }

  const errors: EmailValidationError[] = [];

  if (fields.amount === undefined && !AMOUNT_NOT_REQUIRED.includes(type)) {
    errors.push({ code: "missing-amount", field: "amount", message: "No amount could be extracted from this email." });
  }
  if (fields.amount !== undefined && (!Number.isFinite(fields.amount) || fields.amount < 0)) {
    errors.push({ code: "missing-amount", field: "amount", message: "\"amount\" must be a non-negative number." });
  }

  if (fields.dueDate !== undefined && !isValidDate(fields.dueDate)) {
    errors.push({ code: "invalid-date", field: "dueDate", message: `"dueDate" ("${fields.dueDate}") is not a valid date.` });
  }
  if (fields.statementPeriod && (!isValidDate(fields.statementPeriod.start) || !isValidDate(fields.statementPeriod.end))) {
    errors.push({ code: "invalid-date", field: "statementPeriod", message: "Statement period contains an invalid date." });
  }
  for (const t of fields.transactions) {
    if (!isValidDate(t.date)) {
      errors.push({ code: "invalid-date", field: "transactions", message: `Transaction date "${t.date}" is invalid.` });
      break;
    }
  }

  if (fields.currency && !KNOWN_CURRENCIES.includes(fields.currency)) {
    errors.push({ code: "invalid-currency", field: "currency", message: `"${fields.currency}" is not a recognized currency code.` });
  }

  for (const field of REQUIRED_FIELDS_BY_TYPE[type] ?? []) {
    if (fields[field] === undefined) {
      errors.push({ code: "missing-required-field", field, message: `Missing required field "${field}" for a ${type.replace(/-/g, " ")} email.` });
    }
  }

  return errors;
}

// --- Attachment Detection --------------------------------------------------------

function detectAttachments(raw: RawEmail): EmailAttachmentMeta[] {
  return raw.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, kind: a.kind, documentId: null }));
}

// --- public entry point ---------------------------------------------------------

const COMPLETENESS_FIELDS: (keyof BodyFields)[] = ["merchant", "amount", "invoiceNumber", "referenceNumber", "dueDate", "statementPeriod"];

function completenessRatio(fields: BodyFields): number {
  return COMPLETENESS_FIELDS.filter((key) => fields[key] !== undefined).length / COMPLETENESS_FIELDS.length;
}

export interface EmailAnalysis {
  classification: EmailClassification;
  fields: ExtractedEmailFields;
  validationErrors: EmailValidationError[];
  duplicate: EmailRecord | undefined;
}

/** Never a no-op guess: any EmailType not in EMAIL_TYPES would be a typo in
 * a fixture, not a real classification outcome — checked once here so a
 * silent extraction bug elsewhere fails loudly in tests. */
function assertKnownType(type: EmailType): void {
  if (!EMAIL_TYPES.includes(type)) throw new Error(`Unknown email type "${type}".`);
}

/**
 * Runs Financial Email Classification, Attachment Detection, Body Parsing/
 * Structured Extraction, Validation, and Duplicate Detection over one
 * RawEmail — the four stages the spec groups under "the classification,
 * extraction, and deduplication workflow". No side effects: engine.ts
 * decides what to persist and what to do about a duplicate.
 */
export function processEmail(raw: RawEmail): EmailAnalysis {
  const classification = classifyEmail(raw.subject, raw.body);
  assertKnownType(classification.type);

  const bodyFields = extractBody(classification.type, raw.body, raw.receivedAt.slice(0, 10));
  const attachments = detectAttachments(raw);
  const confidence = classification.confidence * completenessRatio(bodyFields);

  const fields: ExtractedEmailFields = {
    subject: raw.subject,
    sender: raw.sender,
    body: raw.body,
    attachments,
    confidence,
    ...bodyFields,
  };

  const validationErrors = validateEmailFields(classification.type, raw.body, bodyFields);
  const duplicate = findDuplicateEmail(raw, classification.type, fields);

  return { classification, fields, validationErrors, duplicate };
}
