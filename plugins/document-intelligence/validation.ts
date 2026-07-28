/**
 * Validation — pure field-level checks over an already-extracted
 * ExtractedFields: amounts, dates, currency codes, and per-type required
 * fields. Deliberately has no access to the Document Registry: Duplicate
 * Detection (which needs cross-document state) is pipeline.ts's own step,
 * using the "duplicate-number" ValidationErrorCode defined here so both
 * layers report through the same shape.
 */
import { isValidDate } from "@/lib/ingestion/pipeline";
import type { DocumentType, ExtractedFields, ValidationError } from "@/plugins/document-intelligence/types";

const KNOWN_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "JPY", "SGD"];

/** The identifying/structural field(s) each document type is expected to
 * carry, beyond the universal amount check below. Absence doesn't block
 * Import by itself (the user can Edit Fields first) — it's reported so the
 * Upload Preview can show exactly what's missing. */
const REQUIRED_FIELDS_BY_TYPE: Partial<Record<DocumentType, (keyof ExtractedFields)[]>> = {
  receipt: ["receiptNumber"],
  invoice: ["invoiceNumber"],
  "bank-statement": ["accountNumber", "statementPeriod"],
  "credit-card-statement": ["accountNumber", "statementPeriod"],
  "utility-bill": ["accountNumber"],
  "salary-slip": ["statementPeriod"],
  "insurance-receipt": ["receiptNumber"],
  "investment-statement": ["referenceNumber", "statementPeriod"],
  "loan-statement": ["accountNumber", "statementPeriod"],
};

export function validateFields(documentType: DocumentType, fields: ExtractedFields): ValidationError[] {
  if (fields.rawText.trim().length === 0) {
    return [{ code: "malformed-document", message: "No text could be extracted from this document." }];
  }

  const errors: ValidationError[] = [];

  const hasAnyAmount = [fields.amount, fields.total, fields.balance].some((n) => n !== undefined);
  if (!hasAnyAmount && documentType !== "unknown") {
    errors.push({ code: "missing-amount", field: "amount", message: "No amount, total, or balance could be extracted." });
  }
  for (const [field, value] of [
    ["amount", fields.amount],
    ["total", fields.total],
    ["tax", fields.tax],
    ["discount", fields.discount],
    ["balance", fields.balance],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      errors.push({ code: "missing-amount", field, message: `"${field}" must be a non-negative number.` });
    }
  }

  for (const [field, value] of [
    ["issueDate", fields.issueDate],
    ["dueDate", fields.dueDate],
  ] as const) {
    if (value !== undefined && !isValidDate(value)) {
      errors.push({ code: "invalid-date", field, message: `"${field}" ("${value}") is not a valid date.` });
    }
  }
  if (fields.statementPeriod && (!isValidDate(fields.statementPeriod.start) || !isValidDate(fields.statementPeriod.end))) {
    errors.push({ code: "invalid-date", field: "statementPeriod", message: "Statement period contains an invalid date." });
  }
  for (const line of fields.transactions) {
    if (!isValidDate(line.date)) {
      errors.push({ code: "invalid-date", field: "transactions", message: `Transaction date "${line.date}" is invalid.` });
      break; // one report is enough to flag the batch for review
    }
  }

  if (fields.currency && !KNOWN_CURRENCIES.includes(fields.currency)) {
    errors.push({ code: "invalid-currency", field: "currency", message: `"${fields.currency}" is not a recognized currency code.` });
  }

  for (const field of REQUIRED_FIELDS_BY_TYPE[documentType] ?? []) {
    if (fields[field] === undefined) {
      errors.push({
        code: "missing-required-field",
        field,
        message: `Missing required field "${field}" for a ${documentType.replace(/-/g, " ")}.`,
      });
    }
  }

  return errors;
}
