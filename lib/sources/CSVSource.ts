import { ingestTransaction, type IngestInput } from "@/lib/ingestion/pipeline";
import { addTransactions } from "@/lib/storage";
import type {
  IngestResult,
  SourceHealth,
  SourceMetadata,
  TransactionSource,
} from "@/types/source";

const VERSION = "1.0.0";

export interface CSVIngestInput {
  /** Already parsed, validated, mapped, and deduplicated by the Import
   * Engine — this source's only job is running each row through the same
   * Ingestion Pipeline every other source uses, then persisting the batch. */
  rows: IngestInput[];
}

/**
 * Bulk counterpart to ManualSource: Import Engine -> CSVSource -> Ingestion
 * Pipeline -> Storage. Every row still goes through ingestTransaction
 * individually (so Merchant Extraction, AI Memory, and the Classifier run
 * exactly as they would for a manually-entered transaction) — only the
 * final storage write is batched.
 */
class CSVSource implements TransactionSource {
  readonly id = "csv";
  readonly name = "CSV Import";
  readonly description =
    "Bulk-import historical transactions from a CSV file.";
  enabled = true;

  private lastSync: string | null = null;
  private lastHealth: SourceHealth = {
    status: "healthy",
    checkedAt: new Date().toISOString(),
  };

  async ingest(input?: unknown): Promise<IngestResult> {
    if (!this.enabled) {
      throw new Error(
        "CSV Import is disabled. Enable it in Settings to import transactions.",
      );
    }
    const { rows } = (input ?? { rows: [] }) as CSVIngestInput;

    const transactions = [];
    const errors: string[] = [];
    for (const row of rows) {
      try {
        transactions.push(ingestTransaction(row));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Unknown row error.");
      }
    }

    if (transactions.length > 0) {
      addTransactions(transactions);
      this.lastSync = new Date().toISOString();
    }

    return { transactions, errors: errors.length > 0 ? errors : undefined };
  }

  async health(): Promise<SourceHealth> {
    this.lastHealth = {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
    return this.lastHealth;
  }

  metadata(): SourceMetadata {
    return {
      version: VERSION,
      status: "active",
      enabled: this.enabled,
      description: this.description,
      lastSync: this.lastSync,
      health: this.lastHealth.status,
    };
  }
}

export const csvSource = new CSVSource();
