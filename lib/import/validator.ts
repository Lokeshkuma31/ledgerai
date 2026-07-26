import { normalizeDate, parseAmount } from "@/lib/import/mapper";
import { getField } from "@/lib/import/parser";
import type { RawCSVRow } from "@/types/import";

export interface RowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Rejects a row for: missing/unparseable date, invalid (unparseable or
 * zero) amount, or an empty description. Anything else — including unknown
 * extra columns — is ignored. Runs on raw strings, before the mapper
 * converts anything to a typed IngestInput.
 */
export function validateRow(row: RawCSVRow): RowValidationResult {
  const errors: string[] = [];

  const rawDate = getField(row, "Date");
  if (!rawDate) {
    errors.push("Missing date.");
  } else if (!normalizeDate(rawDate)) {
    errors.push(`Unrecognized date format: "${rawDate}".`);
  }

  const rawAmount = getField(row, "Amount");
  if (!rawAmount) {
    errors.push("Missing amount.");
  } else if (parseAmount(rawAmount) === null) {
    errors.push(`Invalid amount: "${rawAmount}".`);
  }

  if (!getField(row, "Description")) {
    errors.push("Empty description.");
  }

  return { valid: errors.length === 0, errors };
}
