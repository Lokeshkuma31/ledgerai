import type { Transaction } from "@/types/transaction";

/** Lifecycle status of a registered source. */
export type SourceStatus = "active" | "coming-soon" | "error";

/** Point-in-time health signal for a source. */
export type SourceHealthStatus = "healthy" | "degraded" | "unavailable" | "unknown";

export interface SourceHealth {
  status: SourceHealthStatus;
  message?: string;
  checkedAt: string; // ISO 8601 timestamp
}

/** Descriptive, display-ready snapshot of a source — what Settings renders. */
export interface SourceMetadata {
  version: string;
  status: SourceStatus;
  enabled: boolean;
  description: string;
  lastSync: string | null; // ISO 8601 timestamp, or null if never synced
  health: SourceHealthStatus;
}

export interface IngestResult {
  transactions: Transaction[];
  errors?: string[];
}

/**
 * Contract every transaction source must implement — manual entry today,
 * SMS/UPI/bank/email/CSV sources in future milestones. Input shape is
 * intentionally opaque here: each source defines and validates its own.
 */
export interface TransactionSource {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  enabled: boolean;
  ingest(input?: unknown): Promise<IngestResult>;
  health(): Promise<SourceHealth>;
  metadata(): SourceMetadata;
}
