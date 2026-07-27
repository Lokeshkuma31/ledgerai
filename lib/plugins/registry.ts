import type { Plugin, PluginHealth, PluginRecord } from "@/types/plugin";

const STATE_KEY = "ledgerai:plugins:state";

interface PersistedPluginState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: PluginHealth;
}

type PersistedStateMap = Record<string, PersistedPluginState>;

function readState(): PersistedStateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as PersistedStateMap) : {};
  } catch {
    return {};
  }
}

function writeState(state: PersistedStateMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** The in-memory instance registry — every actually-registered Plugin
 * object with its live methods. Not persisted: functions aren't
 * serializable, and lib/plugins/loader.ts repopulates this from the same
 * static built-in list every session. Persisted state (enabled/health/
 * timestamps) lives in localStorage, keyed by plugin id, separately. */
const instances = new Map<string, Plugin>();

export function registerPluginInstance(plugin: Plugin): void {
  if (instances.has(plugin.id)) {
    throw new Error(`Plugin "${plugin.id}" is already registered.`);
  }
  instances.set(plugin.id, plugin);

  const state = readState();
  if (!state[plugin.id]) {
    const now = new Date().toISOString();
    state[plugin.id] = { enabled: plugin.enabled, installedAt: now, updatedAt: now };
    writeState(state);
  }
}

export function unregisterPluginInstance(id: string): void {
  instances.delete(id);
}

export function getPluginInstance(id: string): Plugin | undefined {
  return instances.get(id);
}

export function getAllPluginInstances(): Plugin[] {
  return Array.from(instances.values());
}

export function isPluginEnabled(id: string): boolean {
  const plugin = instances.get(id);
  if (!plugin) return false;
  return readState()[id]?.enabled ?? plugin.enabled;
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const plugin = instances.get(id);
  if (!plugin) throw new Error(`Cannot toggle unknown plugin "${id}".`);
  plugin.enabled = enabled;

  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled, installedAt: now, updatedAt: now };
  state[id] = { ...existing, enabled, updatedAt: now };
  writeState(state);
}

export function recordPluginHealth(id: string, health: PluginHealth): void {
  const state = readState();
  const now = new Date().toISOString();
  const existing = state[id] ?? { enabled: instances.get(id)?.enabled ?? false, installedAt: now, updatedAt: now };
  state[id] = { ...existing, lastHealth: health, updatedAt: now };
  writeState(state);
}

/** Every dependency a plugin declares that isn't currently a registered,
 * enabled plugin — used to gate initialize() at install/enable time. */
export function getUnmetDependencies(plugin: Plugin): string[] {
  return (plugin.dependencies ?? []).filter((depId) => !isPluginEnabled(depId));
}

export function getPluginDependents(id: string): Plugin[] {
  return getAllPluginInstances().filter((p) => p.dependencies?.includes(id));
}

/** A read-only snapshot combining live instance data with persisted
 * metadata — Installed Plugins / Enabled Plugins / Plugin Status / Plugin
 * Metadata / Plugin Capabilities / Dependencies, all in one JSON-safe
 * record per plugin. */
export function getAllPluginRecords(): PluginRecord[] {
  const state = readState();
  return getAllPluginInstances().map((plugin) => {
    const now = new Date().toISOString();
    const persisted = state[plugin.id];
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

export function getPluginRecord(id: string): PluginRecord | undefined {
  return getAllPluginRecords().find((r) => r.id === id);
}

export function clearPluginState(): void {
  writeState({});
}
