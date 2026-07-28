import { emitHook } from "@/lib/plugins/hooks";
import { installPlugin } from "@/lib/plugins/lifecycle";
import { getAllSourcePlugins } from "@/lib/plugins/sourceAdapter";
import { androidSmsPlugin } from "@/plugins/android-sms/plugin";
import { accountAggregatorPlugin } from "@/plugins/account-aggregator/plugin";
import type { Plugin } from "@/types/plugin";

let hasLoaded = false;

/**
 * Every built-in plugin the app ships with, statically imported — no
 * dynamic import()/remote fetch/plugin marketplace, matching this
 * milestone's "no dynamic code loading". A new built-in plugin is added
 * here as a new entry in this array.
 */
function builtInPlugins(): Plugin[] {
  return [...getAllSourcePlugins(), androidSmsPlugin, accountAggregatorPlugin];
}

/**
 * Discovers and installs every built-in plugin, once per session. Each
 * plugin is installed independently — a failure installing one never
 * prevents the rest from loading, satisfying "one plugin failure must
 * never affect others" at the loader level (lib/plugins/lifecycle.ts
 * additionally guarantees this at the level of each individual method
 * call within a single plugin). Fires onAppStart once loading finishes.
 */
export async function loadPlugins(): Promise<void> {
  if (hasLoaded) return;
  hasLoaded = true;

  const plugins = builtInPlugins();
  for (const plugin of plugins) {
    try {
      await installPlugin(plugin);
    } catch (error) {
      console.error(`Plugin "${plugin.id}" failed to load:`, error);
    }
  }

  await emitHook("onAppStart", { pluginCount: plugins.length });
}

/** Lets a fresh loadPlugins() run again — useful after clearing
 * localStorage in a dev session, or in tests. */
export function resetLoaderState(): void {
  hasLoaded = false;
}
