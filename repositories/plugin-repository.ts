/**
 * Plugin Repository — Postgres-backed persistence for lib/plugins/
 * registry.ts's persisted half, against the already-seeded
 * PluginRegistryEntry table (prisma/seed.ts). Global, not
 * organization-scoped — matches the schema exactly (PluginRegistryEntry
 * has no organizationId column: which plugins exist/are enabled is a
 * system-wide catalog concept here, not a per-tenant one). Live plugin
 * instances (lib/plugins/registry.ts's `instances` Map — functions aren't
 * serializable) stay exactly where they are, re-registered every cold
 * start by lib/plugins/loader.ts.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type { PluginHealth, PluginLifecycleStatus } from "@/types/plugin";

export interface PersistedPluginState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: PluginHealth;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  version: string;
  author: string;
  capabilities: string[];
  dependencies: string[];
}

function statusFor(enabled: boolean): PluginLifecycleStatus {
  return enabled ? "enabled" : "disabled";
}

/** Seeds a full descriptive entry on first registration only — mirrors
 * lib/plugins/registry.ts::registerPluginInstance's `if (!state[id])`
 * guard, extended to also cover the descriptive fields the Prisma model
 * has that the old localStorage PersistedPluginState didn't (name/
 * version/author/capabilities/dependencies) — prisma/seed.ts already
 * upserts these for the 4 built-in plugins; this is the same operation
 * for any plugin registering for the first time outside that seed. */
export async function ensurePluginRegistered(
  descriptor: PluginDescriptor,
  enabled: boolean,
): Promise<void> {
  await prisma.pluginRegistryEntry.upsert({
    where: { id: descriptor.id },
    create: {
      id: descriptor.id,
      name: descriptor.name,
      version: descriptor.version,
      author: descriptor.author,
      capabilities: descriptor.capabilities,
      dependencies: descriptor.dependencies,
      enabled,
      status: statusFor(enabled),
      health: {
        status: "unavailable",
        message: "Not yet checked.",
        checkedAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
}

export async function getState(id: string): Promise<PersistedPluginState | undefined> {
  const row = await prisma.pluginRegistryEntry.findUnique({ where: { id } });
  if (!row) return undefined;
  return {
    enabled: row.enabled,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastHealth: row.health as unknown as PluginHealth,
  };
}

export async function getAllStates(): Promise<Record<string, PersistedPluginState>> {
  const rows = await prisma.pluginRegistryEntry.findMany();
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        enabled: row.enabled,
        installedAt: row.installedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastHealth: row.health as unknown as PluginHealth,
      },
    ]),
  );
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  await prisma.pluginRegistryEntry.update({
    where: { id },
    data: { enabled, status: statusFor(enabled) },
  });
}

export async function recordPluginHealth(id: string, health: PluginHealth): Promise<void> {
  await prisma.pluginRegistryEntry.update({
    where: { id },
    data: { health: health as unknown as Prisma.InputJsonValue },
  });
}

export async function clearPluginState(): Promise<void> {
  // Mirrors lib/plugins/registry.ts::clearPluginState's intent (reset
  // persisted state) without deleting the catalog rows prisma/seed.ts
  // owns — resets enabled/health back to defaults instead.
  await prisma.pluginRegistryEntry.updateMany({
    data: {
      enabled: true,
      status: "enabled",
      health: {
        status: "unavailable",
        message: "Not yet checked.",
        checkedAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    },
  });
}
