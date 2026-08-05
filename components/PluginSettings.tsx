"use client";

import { useEffect, useState } from "react";
import PluginList from "@/components/PluginList";
import {
  disablePlugin,
  enablePlugin,
  getAllPluginRecords,
  loadPlugins,
  reloadPlugin,
  uninstallPlugin,
} from "@/lib/plugins/engine";
import { captureClient } from "@/lib/observability/analytics-client";
import type { PluginRecord } from "@/types/plugin";

/**
 * Backs app/plugins/page.tsx — loads (or confirms already-loaded) the
 * built-in plugins, then lets the user enable/disable/reload/uninstall
 * each one. Every action goes through lib/plugins/engine.ts; this
 * component never touches lib/plugins' internal modules directly.
 */
export default function PluginSettings() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  function refresh() {
    setPlugins(getAllPluginRecords());
  }

  useEffect(() => {
    loadPlugins().finally(refresh);
  }, []);

  async function withBusy(id: string, action: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await action();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    }
  }

  function handleToggleEnabled(plugin: PluginRecord) {
    const willEnable = !plugin.enabled;
    void withBusy(plugin.id, () => (plugin.enabled ? disablePlugin(plugin.id) : enablePlugin(plugin.id))).then(() => {
      if (willEnable) captureClient("plugin_enabled", { plugin_id: plugin.id, plugin_version: plugin.version });
      else captureClient("plugin_disabled", { plugin_id: plugin.id });
    });
  }

  function handleReload(plugin: PluginRecord) {
    void withBusy(plugin.id, () => reloadPlugin(plugin.id));
  }

  function handleUninstall(plugin: PluginRecord) {
    void withBusy(plugin.id, () => uninstallPlugin(plugin.id));
  }

  return (
    <PluginList
      plugins={plugins}
      busyPluginIds={busyIds}
      onToggleEnabled={handleToggleEnabled}
      onReload={handleReload}
      onUninstall={handleUninstall}
    />
  );
}
