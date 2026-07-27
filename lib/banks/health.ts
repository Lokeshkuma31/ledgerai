/**
 * Connector Health — pure TypeScript, no React. Owns exactly one
 * concern: deciding a connector's ConnectorHealthStatus, either by asking
 * the connector directly (checkConnectorHealth, mirroring
 * lib/plugins/lifecycle.ts's checkPluginHealth) or by reading a just-
 * completed SyncRun (deriveHealthFromSyncRun, used by sync-engine.ts
 * right after a sync so it doesn't have to re-query the connector).
 */
import { getConnector, isConnectorEnabled, recordConnectorConnection, recordConnectorHealth } from "@/lib/banks/registry";
import type { ConnectorHealth, SyncRun } from "@/lib/banks/types";

/**
 * Queries a connector's own health()/status() and reconciles them into a
 * single ConnectorHealth, persisting the result. A disabled connector
 * never reaches the connector's own methods — "disabled" always wins,
 * mirroring how a disabled Plugin reports itself without calling into
 * its own health() logic unnecessarily.
 */
export async function checkConnectorHealth(id: string): Promise<ConnectorHealth> {
  const checkedAt = new Date().toISOString();
  const connector = getConnector(id);
  if (!connector) {
    return { status: "disconnected", message: "Connector is not installed.", checkedAt };
  }

  if (!isConnectorEnabled(id)) {
    const health: ConnectorHealth = { status: "disabled", message: "Connector is disabled.", checkedAt };
    recordConnectorHealth(id, health);
    return health;
  }

  try {
    const [health, status] = await Promise.all([connector.health(), connector.status()]);

    let resolved = health;
    if (status.connection === "authenticating" || status.connection === "reauthentication-required") {
      resolved = {
        status: "authentication-required",
        message: status.message ?? "Reauthentication is required to continue syncing.",
        checkedAt,
      };
    } else if (status.connection === "error" && health.status !== "error") {
      resolved = { status: "error", message: status.message ?? health.message, checkedAt };
    } else if (status.connection === "disconnected" && health.status === "healthy") {
      resolved = { status: "disconnected", message: status.message ?? "Not connected.", checkedAt };
    }

    recordConnectorHealth(id, resolved);
    recordConnectorConnection(id, status.connection);
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const health: ConnectorHealth = { status: "error", message: `Health check failed: ${message}`, checkedAt };
    recordConnectorHealth(id, health);
    return health;
  }
}

/**
 * Derives health straight from a SyncRun's own outcome — cheaper than a
 * fresh checkConnectorHealth() call, and reflects exactly what the most
 * recent sync actually found rather than a separate live query that could
 * disagree with it.
 */
export function deriveHealthFromSyncRun(run: SyncRun): ConnectorHealth {
  const checkedAt = run.completedAt ?? new Date().toISOString();
  if (run.status === "running") {
    return { status: "syncing", message: "Sync in progress.", checkedAt };
  }
  if (run.status === "failed") {
    return {
      status: "error",
      message: run.errors[0]?.message ?? "The last sync failed.",
      checkedAt,
    };
  }
  if (run.status === "partial") {
    return {
      status: "warning",
      message: `The last sync completed with ${run.errors.length} error(s).`,
      checkedAt,
    };
  }
  return {
    status: "healthy",
    message: `Synced ${run.transactionsImported} new transaction(s), ${run.transactionsUpdated} updated.`,
    checkedAt,
  };
}
