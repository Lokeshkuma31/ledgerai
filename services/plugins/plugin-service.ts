/**
 * Plugin Service — combines lib/plugins/registry.ts's in-memory live
 * plugin instances (unchanged — functions aren't serializable, and
 * lib/plugins/loader.ts re-registers them every cold start) with
 * repositories/plugin-repository.ts's Postgres-backed persisted state,
 * the same split established for Connection Hub/Bank/Email. Mirrors
 * lib/plugins/registry.ts's public API exactly, async where persistence
 * is involved. Global, not organization-scoped (see the repository's own
 * comment on why).
 */
import { getAllPluginInstances, getPluginInstance } from "@/lib/plugins/registry";
import type { Plugin, PluginHealth, PluginRecord } from "@/types/plugin";
import * as pluginRepository from "@/repositories/plugin-repository";

export async function registerPluginState(plugin: Plugin): Promise<void> {
  await pluginRepository.ensurePluginRegistered(
    {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author,
      capabilities: plugin.capabilities(),
      dependencies: plugin.dependencies ?? [],
    },
    plugin.enabled,
  );
}

export async function isPluginEnabled(id: string): Promise<boolean> {
  const plugin = getPluginInstance(id);
  if (!plugin) return false;
  const state = await pluginRepository.getState(id);
  return state?.enabled ?? plugin.enabled;
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const plugin = getPluginInstance(id);
  if (!plugin) throw new Error(`Cannot toggle unknown plugin "${id}".`);
  plugin.enabled = enabled;
  await pluginRepository.setPluginEnabled(id, enabled);
}

export async function recordPluginHealth(id: string, health: PluginHealth): Promise<void> {
  await pluginRepository.recordPluginHealth(id, health);
}

/** Every dependency a plugin declares that isn't currently a registered,
 * enabled plugin — mirrors lib/plugins/registry.ts::getUnmetDependencies. */
export async function getUnmetDependencies(plugin: Plugin): Promise<string[]> {
  const results = await Promise.all(
    (plugin.dependencies ?? []).map(async (depId) => ({ depId, enabled: await isPluginEnabled(depId) })),
  );
  return results.filter((r) => !r.enabled).map((r) => r.depId);
}

export function getPluginDependents(id: string): Plugin[] {
  return getAllPluginInstances().filter((p) => p.dependencies?.includes(id));
}

/** A read-only snapshot combining live instance data with persisted
 * metadata — mirrors lib/plugins/registry.ts::getAllPluginRecords exactly. */
export async function getAllPluginRecords(): Promise<PluginRecord[]> {
  const states = await pluginRepository.getAllStates();
  const now = new Date().toISOString();
  return getAllPluginInstances().map((plugin) => {
    const persisted = states[plugin.id];
    const enabled = persisted?.enabled ?? plugin.enabled;
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author,
      description: plugin.description,
      capabilities: plugin.capabilities(),
      dependencies: plugin.dependencies ?? [],
      enabled,
      status: enabled ? "enabled" : "disabled",
      health: persisted?.lastHealth ?? { status: "unavailable", message: "Not yet checked.", checkedAt: now },
      installedAt: persisted?.installedAt ?? now,
      updatedAt: persisted?.updatedAt ?? now,
    };
  });
}

export async function getPluginRecord(id: string): Promise<PluginRecord | undefined> {
  const records = await getAllPluginRecords();
  return records.find((r) => r.id === id);
}

export async function clearPluginState(): Promise<void> {
  return pluginRepository.clearPluginState();
}
