import { manualSource } from "@/lib/sources/ManualSource";
import { sourceRegistry } from "@/lib/sources/SourceRegistry";
import type { SourceHealth, SourceMetadata, TransactionSource } from "@/types/source";

const ENABLED_STATE_KEY = "ledgerai:sources:enabled";

/**
 * A source that doesn't exist yet — visible in Settings with a
 * "Coming Soon" badge, but not functional. Adding the real implementation
 * later means replacing this call with `sourceRegistry.register(new XSource())`;
 * nothing else in the app needs to change.
 */
function registerComingSoon(
  id: string,
  name: string,
  description: string,
): void {
  const health: SourceHealth = {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
  };
  const source: TransactionSource = {
    id,
    name,
    description,
    enabled: false,
    async ingest() {
      throw new Error(`${name} is not available yet.`);
    },
    async health() {
      return health;
    },
    metadata(): SourceMetadata {
      return {
        version: "0.0.0",
        status: "coming-soon",
        enabled: false,
        description,
        lastSync: null,
        health: health.status,
      };
    },
  };
  sourceRegistry.register(source);
}

sourceRegistry.register(manualSource);
registerComingSoon(
  "sms",
  "SMS Reader",
  "Automatically parse bank SMS alerts into transactions.",
);
registerComingSoon(
  "upi",
  "UPI Notifications",
  "Capture UPI payment notifications as they arrive.",
);
registerComingSoon(
  "bank-api",
  "Bank API",
  "Sync transactions directly from your bank.",
);
registerComingSoon(
  "email",
  "Email Import",
  "Import transactions from e-mailed receipts and statements.",
);
registerComingSoon(
  "csv",
  "CSV Import",
  "Bulk import transactions from a CSV file.",
);

/** Restores enabled/disabled choices the user made in Settings. Only ever
 * applies to sources that are actually implemented (status "active") —
 * stale localStorage from a future build can't silently "enable" a
 * coming-soon stub. */
function loadEnabledState(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(ENABLED_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    for (const [id, enabled] of Object.entries(parsed)) {
      const source = sourceRegistry.getSource(id);
      if (source && source.metadata().status === "active") {
        sourceRegistry.setEnabled(id, enabled);
      }
    }
  } catch {
    // Corrupt state: fall back to each source's default.
  }
}

loadEnabledState();

export function setSourceEnabled(id: string, enabled: boolean): void {
  sourceRegistry.setEnabled(id, enabled);
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(ENABLED_STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[id] = enabled;
    window.localStorage.setItem(ENABLED_STATE_KEY, JSON.stringify(parsed));
  } catch {
    // Best-effort persistence; in-memory state is already updated.
  }
}

export { sourceRegistry };
