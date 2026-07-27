import {
  getPluginInstance,
  getUnmetDependencies,
  recordPluginHealth,
  registerPluginInstance,
  setPluginEnabled,
  unregisterPluginInstance,
} from "@/lib/plugins/registry";
import type { Plugin, PluginHealth } from "@/types/plugin";

/**
 * Every plugin method call funnels through here — this is the single
 * choke point that turns "one plugin failure must never affect others"
 * into an actual guarantee, rather than something each call site has to
 * remember to do itself.
 */
async function safeCall<T>(
  plugin: Plugin,
  action: string,
  fn: () => T | Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordPluginHealth(plugin.id, {
      status: "error",
      message: `${action} failed: ${message}`,
      checkedAt: new Date().toISOString(),
    });
    return undefined;
  }
}

/**
 * Install: registers a plugin instance, runs register(), and — if its
 * dependencies are met and it's enabled — initialize(). A missing
 * dependency leaves the plugin registered but not initialized, flagged
 * with a "warning" health status explaining why.
 */
export async function installPlugin(plugin: Plugin): Promise<void> {
  registerPluginInstance(plugin);
  await safeCall(plugin, "register", () => plugin.register());

  const unmet = getUnmetDependencies(plugin);
  if (unmet.length > 0) {
    recordPluginHealth(plugin.id, {
      status: "warning",
      message: `Waiting on dependencies: ${unmet.join(", ")}.`,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  if (plugin.enabled) {
    await safeCall(plugin, "initialize", () => plugin.initialize());
  }
  await checkPluginHealth(plugin.id);
}

export async function enablePlugin(id: string): Promise<void> {
  const plugin = getPluginInstance(id);
  if (!plugin) throw new Error(`Cannot enable unknown plugin "${id}".`);

  const unmet = getUnmetDependencies(plugin);
  if (unmet.length > 0) {
    recordPluginHealth(id, {
      status: "warning",
      message: `Cannot enable — waiting on dependencies: ${unmet.join(", ")}.`,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  setPluginEnabled(id, true);
  await safeCall(plugin, "initialize", () => plugin.initialize());
  await checkPluginHealth(id);
}

export async function disablePlugin(id: string): Promise<void> {
  const plugin = getPluginInstance(id);
  if (!plugin) throw new Error(`Cannot disable unknown plugin "${id}".`);
  await safeCall(plugin, "shutdown", () => plugin.shutdown());
  setPluginEnabled(id, false);
  await checkPluginHealth(id);
}

/** Disable then re-enable — the simplest deterministic way to pick up any
 * change to a plugin's own state without a real dynamic-reload mechanism
 * (which is explicitly out of scope for this milestone). */
export async function reloadPlugin(id: string): Promise<void> {
  const plugin = getPluginInstance(id);
  if (!plugin) throw new Error(`Cannot reload unknown plugin "${id}".`);
  if (plugin.enabled) {
    await safeCall(plugin, "shutdown", () => plugin.shutdown());
    await safeCall(plugin, "initialize", () => plugin.initialize());
  }
  await checkPluginHealth(id);
}

export async function uninstallPlugin(id: string): Promise<void> {
  const plugin = getPluginInstance(id);
  if (!plugin) return;
  if (plugin.enabled) {
    await safeCall(plugin, "shutdown", () => plugin.shutdown());
  }
  await safeCall(plugin, "unregister", () => plugin.unregister());
  unregisterPluginInstance(id);
}

/** Always calls the plugin's own health() — a disabled/coming-soon plugin
 * is expected to report that itself (see lib/plugins/sourceAdapter.ts),
 * rather than this layer guessing on its behalf. */
export async function checkPluginHealth(id: string): Promise<PluginHealth> {
  const plugin = getPluginInstance(id);
  if (!plugin) {
    return { status: "unavailable", message: "Plugin is not installed.", checkedAt: new Date().toISOString() };
  }
  const health = (await safeCall(plugin, "health", () => plugin.health())) ?? {
    status: "error",
    message: "Health check threw an error.",
    checkedAt: new Date().toISOString(),
  };
  recordPluginHealth(id, health);
  return health;
}

/**
 * Version Check: validates a plugin's declared semver, and — if a floor
 * is supplied — whether it meets it. There's no remote registry to
 * compare against (no marketplace, no network lookups in this milestone),
 * so this is purely a local, deterministic comparison.
 */
export function checkPluginVersion(plugin: Plugin, minimumVersion?: string): boolean {
  const isValidSemver = /^\d+\.\d+\.\d+$/.test(plugin.version);
  if (!isValidSemver) return false;
  if (!minimumVersion || !/^\d+\.\d+\.\d+$/.test(minimumVersion)) return isValidSemver;

  const toParts = (v: string) => v.split(".").map(Number) as [number, number, number];
  const [pMajor, pMinor, pPatch] = toParts(plugin.version);
  const [mMajor, mMinor, mPatch] = toParts(minimumVersion);
  if (pMajor !== mMajor) return pMajor > mMajor;
  if (pMinor !== mMinor) return pMinor > mMinor;
  return pPatch >= mPatch;
}
