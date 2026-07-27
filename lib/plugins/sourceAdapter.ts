import { setSourceEnabled, sourceRegistry } from "@/lib/sources";
import type { Plugin, PluginCapability, PluginHealth } from "@/types/plugin";
import type { SourceHealthStatus, TransactionSource } from "@/types/source";

const HEALTH_STATUS_MAP: Record<SourceHealthStatus, PluginHealth["status"]> = {
  healthy: "healthy",
  degraded: "warning",
  unavailable: "unavailable",
  unknown: "warning",
};

/**
 * Wraps an existing TransactionSource as a Plugin — this is how "sources
 * are treated as plugins": the adapter only translates between the two
 * already-published interfaces. CSVSource/ManualSource/SourceRegistry keep
 * every bit of their own ingest/health/metadata logic untouched; nothing
 * here re-implements it.
 */
class SourcePlugin implements Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author = "LedgerAI";
  readonly description: string;
  enabled: boolean;

  constructor(private readonly source: TransactionSource) {
    this.id = `source:${source.id}`;
    this.name = source.name;
    this.description = source.description;
    this.enabled = source.enabled;
    this.version = source.metadata().version;
  }

  capabilities(): PluginCapability[] {
    return ["transaction-source"];
  }

  register(): void {
    // Already registered in sourceRegistry by lib/sources' own module-load
    // side effect (see lib/sources/index.ts) — nothing further to do.
  }

  unregister(): void {
    sourceRegistry.unregister(this.source.id);
  }

  initialize(): void {
    setSourceEnabled(this.source.id, this.enabled);
  }

  shutdown(): void {
    setSourceEnabled(this.source.id, false);
  }

  async health(): Promise<PluginHealth> {
    const health = await this.source.health();
    const mapped = HEALTH_STATUS_MAP[health.status];
    // A source that's fundamentally unavailable (e.g. "coming soon") stays
    // unavailable regardless of its enabled flag; a genuinely healthy
    // source that's just been toggled off reads as "disabled" instead.
    const status = !this.enabled && mapped !== "unavailable" ? "disabled" : mapped;
    return {
      status,
      message: health.message ?? this.source.metadata().description,
      checkedAt: health.checkedAt,
    };
  }
}

/** Every registered transaction source, wrapped as a Plugin — the
 * lib/plugins/loader.ts entry point for the Source Framework integration. */
export function getAllSourcePlugins(): Plugin[] {
  return sourceRegistry.getAllSources().map((source) => new SourcePlugin(source));
}
