import type { CSVParseResult, RawCSVRow } from "@/types/import";

/**
 * RFC4180-ish CSV tokenizer: handles quoted fields, escaped `""` quotes,
 * commas/newlines inside quotes, and CRLF/LF line endings. No streaming —
 * the whole file is parsed in memory, which is fine for personal bank
 * statement exports.
 */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // skip — \n (or end of file) closes the row
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }
  // Final row, if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop fully-blank rows (e.g. trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Strips everything but lowercase letters/digits, so "Payment Method",
 * "payment_method", and "PaymentMethod" all normalize to the same key. */
function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_HEADERS: Record<string, string> = {
  date: "Date",
  description: "Description",
  amount: "Amount",
  paymentmethod: "Payment Method",
  debitcredit: "Debit/Credit",
  reference: "Reference",
};

/**
 * Parses CSV text into header-keyed rows. Recognized columns (Date,
 * Description, Amount, Payment Method, Debit/Credit, Reference) are
 * normalized to their canonical name regardless of the exact header casing
 * or punctuation in the file; any other column passes through under its
 * original header, untouched and unused downstream.
 */
export function parseCSV(text: string): CSVParseResult {
  const tokenized = tokenize(text);
  if (tokenized.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = tokenized;
  const headers = headerRow.map(
    (h) => CANONICAL_HEADERS[normalizeHeader(h)] ?? h.trim(),
  );

  const rows: RawCSVRow[] = dataRows.map((values) => {
    const row: RawCSVRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

export function getField(row: RawCSVRow, canonicalName: string): string {
  return row[canonicalName]?.trim() ?? "";
}
