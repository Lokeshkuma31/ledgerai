// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { registerPluginInstance, unregisterPluginInstance } from "@/lib/plugins/registry";
import type { Plugin, PluginHealth } from "@/types/plugin";
import {
  getAllPluginRecords,
  getPluginDependents,
  getPluginRecord,
  getUnmetDependencies,
  isPluginEnabled,
  recordPluginHealth,
  registerPluginState,
  setPluginEnabled,
} from "@/services/plugins/plugin-service";

const PLUGIN_ID = `test-plugin-${crypto.randomUUID()}`;
const DEPENDENT_ID = `test-plugin-dependent-${crypto.randomUUID()}`;

vi.setConfig({ testTimeout: 20000 });

function makePlugin(id: string, overrides: Partial<Plugin> = {}): Plugin {
  return {
    id,
    name: "Test Plugin",
    version: "1.0.0",
    author: "LedgerAI",
    description: "A plugin registered only for tests.",
    enabled: true,
    initialize: () => {},
    shutdown: () => {},
    register: () => {},
    unregister: () => {},
    health: () => ({ status: "healthy", message: "OK", checkedAt: new Date().toISOString() }),
    capabilities: () => ["transaction-source"],
    ...overrides,
  };
}

afterAll(async () => {
  await prisma.pluginRegistryEntry.deleteMany({ where: { id: { in: [PLUGIN_ID, DEPENDENT_ID] } } });
  await prisma.$disconnect();
});

afterEach(async () => {
  unregisterPluginInstance(PLUGIN_ID);
  unregisterPluginInstance(DEPENDENT_ID);
  await prisma.pluginRegistryEntry.deleteMany({ where: { id: { in: [PLUGIN_ID, DEPENDENT_ID] } } });
});

describe("Plugin service", () => {
  beforeEach(() => {
    registerPluginInstance(makePlugin(PLUGIN_ID));
  });

  it("registerPluginState seeds enabled=true on first registration only", async () => {
    await registerPluginState(makePlugin(PLUGIN_ID));
    expect(await isPluginEnabled(PLUGIN_ID)).toBe(true);

    await setPluginEnabled(PLUGIN_ID, false);
    // Re-registering (a hot-reload re-register) must not clobber the
    // user's own enabled choice.
    await registerPluginState(makePlugin(PLUGIN_ID));
    expect(await isPluginEnabled(PLUGIN_ID)).toBe(false);
  });

  it("setPluginEnabled toggles and rejects an unknown plugin id", async () => {
    await registerPluginState(makePlugin(PLUGIN_ID));
    await setPluginEnabled(PLUGIN_ID, false);
    expect(await isPluginEnabled(PLUGIN_ID)).toBe(false);

    await expect(setPluginEnabled("does-not-exist", true)).rejects.toThrow(/unknown plugin/);
  });

  it("recordPluginHealth persists and surfaces via getAllPluginRecords/getPluginRecord", async () => {
    await registerPluginState(makePlugin(PLUGIN_ID));
    const health: PluginHealth = { status: "warning", message: "Degraded", checkedAt: new Date().toISOString() };
    await recordPluginHealth(PLUGIN_ID, health);

    const record = await getPluginRecord(PLUGIN_ID);
    expect(record?.health).toEqual(health);
    expect(record?.capabilities).toEqual(["transaction-source"]);

    const all = await getAllPluginRecords();
    expect(all.some((r) => r.id === PLUGIN_ID)).toBe(true);
  });

  it("getUnmetDependencies reports dependencies that aren't registered+enabled", async () => {
    const dependent = makePlugin(DEPENDENT_ID, { dependencies: [PLUGIN_ID] });
    registerPluginInstance(dependent);
    await registerPluginState(makePlugin(PLUGIN_ID));
    await registerPluginState(dependent);

    // PLUGIN_ID enabled by default — no unmet dependencies.
    expect(await getUnmetDependencies(dependent)).toEqual([]);

    await setPluginEnabled(PLUGIN_ID, false);
    expect(await getUnmetDependencies(dependent)).toEqual([PLUGIN_ID]);
  });

  it("getPluginDependents finds plugins that declare a dependency on the given id", async () => {
    const dependent = makePlugin(DEPENDENT_ID, { dependencies: [PLUGIN_ID] });
    registerPluginInstance(dependent);

    const dependents = getPluginDependents(PLUGIN_ID);
    expect(dependents.map((p) => p.id)).toContain(DEPENDENT_ID);
  });
});
