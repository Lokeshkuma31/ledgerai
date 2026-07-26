import { ingestTransaction, type IngestInput } from "@/lib/ingestion/pipeline";
import { addTransaction } from "@/lib/storage";
import type {
  IngestResult,
  SourceHealth,
  SourceMetadata,
  TransactionSource,
} from "@/types/source";

const VERSION = "1.0.0";

/**
 * Manual expense entry, reimplemented as a Source Plugin. Owns the full
 * Dashboard -> ManualSource -> Ingestion Pipeline -> Storage path: it runs
 * the shared pipeline to build a Transaction, then persists it, so callers
 * (the Dashboard) never touch the pipeline or storage directly.
 */
class ManualSource implements TransactionSource {
  readonly id = "manual";
  readonly name = "Manual Entry";
  readonly description =
    "Add expenses and income yourself, one transaction at a time.";
  enabled = true;

  private lastSync: string | null = null;
  private lastHealth: SourceHealth = {
    status: "healthy",
    checkedAt: new Date().toISOString(),
  };

  async ingest(input?: unknown): Promise<IngestResult> {
    if (!this.enabled) {
      throw new Error(
        "Manual Entry is disabled. Enable it in Settings to add transactions.",
      );
    }
    const transaction = ingestTransaction(input as IngestInput);
    addTransaction(transaction);
    this.lastSync = transaction.createdAt;
    return { transactions: [transaction] };
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

export const manualSource = new ManualSource();
export type { IngestInput };
