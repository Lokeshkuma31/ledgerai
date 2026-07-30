/**
 * Sync Provider Registry — holds every registered provider and their
 * per-provider schedule preference. Deliberately independent of React,
 * execution, and any specific provider implementation — it only knows the
 * SyncProvider shape, mirroring lib/sources/SourceRegistry.ts's split
 * between "what's registered" and "what runs it."
 *
 * Provider instances themselves (functions, closures) aren't
 * JSON-serializable, so they live in-memory only, exactly like
 * lib/sources/SourceRegistry.ts's own Map — only the user's schedule
 * choice is persisted (see scheduler.ts).
 */
import type { SyncProvider, SyncProviderCategory } from "@/lib/sync/types";

export class SyncProviderRegistry {
  private providers = new Map<string, SyncProvider>();

  register(provider: SyncProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Sync provider "${provider.id}" is already registered.`);
    }
    this.providers.set(provider.id, provider);
  }

  /** Re-registration during development/hot-reload shouldn't throw — the
   * caller (a plugin's own register()) is expected to unregister its old
   * instance first when replacing one, exactly like SourceRegistry. */
  unregister(id: string): void {
    this.providers.delete(id);
  }

  getProvider(id: string): SyncProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): SyncProvider[] {
    return Array.from(this.providers.values());
  }

  getProvidersByCategory(category: SyncProviderCategory): SyncProvider[] {
    return this.getAllProviders().filter((provider) => provider.category === category);
  }
}

export const syncProviderRegistry = new SyncProviderRegistry();

/**
 * Published registration entry point — "each source registers itself with
 * the Sync Engine" from the spec. Returns an unregister function, the same
 * shape as lib/feed/engine.ts's registerFeedContributor, so a plugin's own
 * unregister() can clean up without reaching into this registry directly.
 */
export function registerSyncProvider(provider: SyncProvider): () => void {
  syncProviderRegistry.register(provider);
  return () => syncProviderRegistry.unregister(provider.id);
}

export function getAllSyncProviders(): SyncProvider[] {
  return syncProviderRegistry.getAllProviders();
}

export function getSyncProvider(id: string): SyncProvider | undefined {
  return syncProviderRegistry.getProvider(id);
}
