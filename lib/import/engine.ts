import { extractMerchant } from "@/lib/merchant/engine";
import { getAllMerchants } from "@/lib/merchant/registry";
import { getField, parseCSV } from "@/lib/import/parser";
import { validateRow } from "@/lib/import/validator";
import { mapRowToIngestInput } from "@/lib/import/mapper";
import { recordImport } from "@/lib/import/history";
import { sourceRegistry } from "@/lib/sources/SourceRegistry";
import type { CSVIngestInput } from "@/lib/sources/CSVSource";
import type { Transaction } from "@/types/transaction";
import type { ImportPreview, ImportPreviewRow, ImportReport, ImportRowError } from "@/types/import";

/**
 * A duplicate is same Date + Amount + Merchant + Description (per spec).
 * Merchant is read via the pure, non-registering `extractMerchant` here —
 * preview must never write to the merchant registry, only actual import
 * (via CSVSource -> the pipeline's identifyMerchant) does that.
 */
function duplicateSignature(
  date: string,
  amount: number,
  merchantName: string | undefined,
  note: string,
): string {
  return [
    date,
    amount.toFixed(2),
    (merchantName ?? "").trim().toLowerCase(),
    note.trim().toLowerCase(),
  ].join("|");
}

/**
 * Parses, validates, maps, and duplicate-checks every row — a pure,
 * read-only pass with no side effects (no merchant registration, no
 * storage writes). Nothing here has run through the Ingestion Pipeline yet.
 */
export function buildImportPreview(
  fileName: string,
  csvText: string,
  existingTransactions: Transaction[],
): ImportPreview {
  const { rows: rawRows } = parseCSV(csvText);

  const existingSignatures = new Set(
    existingTransactions.map((t) =>
      duplicateSignature(t.date, t.amount, t.merchantName, t.note),
    ),
  );
  const seenInBatch = new Set<string>();

  const rows: ImportPreviewRow[] = rawRows.map((raw, index) => {
    const rowNumber = index + 2; // header occupies row 1
    const rawDate = getField(raw, "Date");
    const rawDescription = getField(raw, "Description");

    const validation = validateRow(raw);
    if (!validation.valid) {
      return {
        rowNumber,
        date: rawDate,
        description: rawDescription,
        amount: null,
        status: "Invalid",
        errors: validation.errors,
      };
    }

    const mappedInput = mapRowToIngestInput(raw);
    const merchant = extractMerchant(mappedInput.note);
    const signature = duplicateSignature(
      mappedInput.date,
      mappedInput.amount,
      merchant?.name,
      mappedInput.note,
    );
    const isDuplicate = existingSignatures.has(signature) || seenInBatch.has(signature);
    seenInBatch.add(signature);

    return {
      rowNumber,
      date: mappedInput.date,
      description: mappedInput.note,
      merchantName: merchant?.name,
      amount: mappedInput.amount,
      status: isDuplicate ? "Duplicate" : "Ready",
      errors: [],
      mappedInput,
    };
  });

  return {
    fileName,
    totalRows: rows.length,
    readyCount: rows.filter((r) => r.status === "Ready").length,
    duplicateCount: rows.filter((r) => r.status === "Duplicate").length,
    invalidCount: rows.filter((r) => r.status === "Invalid").length,
    rows,
  };
}

/**
 * Imports every "Ready" row from a preview through the real Source
 * Framework: CSVSource -> Ingestion Pipeline -> Merchant Intelligence ->
 * AI Memory -> Classifier -> Storage. Duplicate/Invalid rows are never
 * sent through the pipeline; they're only reported as warnings. Records
 * the resulting report into import history.
 */
export async function executeImport(preview: ImportPreview): Promise<ImportReport> {
  const startedAt = new Date();

  const csvSource = sourceRegistry.getSource("csv");
  if (!csvSource) {
    throw new Error("CSV Source is not registered.");
  }

  const readyRows = preview.rows.filter(
    (r): r is ImportPreviewRow & { mappedInput: NonNullable<ImportPreviewRow["mappedInput"]> } =>
      r.status === "Ready" && r.mappedInput !== undefined,
  );

  const merchantIdsBefore = new Set(getAllMerchants().map((m) => m.id));

  const input: CSVIngestInput = { rows: readyRows.map((r) => r.mappedInput) };
  const result = await csvSource.ingest(input);
  const imported = result.transactions;

  const involvedMerchantIds = new Set(
    imported.map((t) => t.merchantId).filter((id): id is string => id !== undefined),
  );
  const newMerchantCount = [...involvedMerchantIds].filter(
    (id) => !merchantIdsBefore.has(id),
  ).length;

  const invalidRows = preview.rows.filter((r) => r.status === "Invalid");
  const duplicateRows = preview.rows.filter((r) => r.status === "Duplicate");
  const pipelineErrors: ImportRowError[] = (result.errors ?? []).map((message) => ({
    rowNumber: -1,
    message,
  }));

  const warnings: ImportRowError[] = [
    ...invalidRows.flatMap((r) => r.errors.map((message) => ({ rowNumber: r.rowNumber, message }))),
    ...duplicateRows.map((r) => ({
      rowNumber: r.rowNumber,
      message: "Duplicate of an existing transaction.",
    })),
    ...pipelineErrors,
  ];

  const finishedAt = new Date();
  const report: ImportReport = {
    fileName: preview.fileName,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    importedCount: imported.length,
    skippedCount: invalidRows.length + duplicateRows.length,
    duplicateCount: duplicateRows.length,
    invalidCount: invalidRows.length,
    detectedMerchantCount: involvedMerchantIds.size,
    newMerchantCount,
    aiCategoriesAssignedCount: imported.filter((t) => t.aiCategory !== undefined).length,
    memoryMatchCount: imported.filter((t) => t.classificationSource === "memory").length,
    warnings,
  };

  recordImport(report);
  return report;
}
