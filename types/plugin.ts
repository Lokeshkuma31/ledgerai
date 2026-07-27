export const PLUGIN_CAPABILITIES = [
  "transaction-source",
  "workflow-step",
  "feed-generator",
  "event-generator",
  "recommendation-provider",
  "notification-provider",
  "import-provider",
  "search-provider",
  "dashboard-widget",
  "settings-page",
  "background-task",
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export const PLUGIN_HEALTH_STATUSES = ["healthy", "warning", "error", "disabled", "unavailable"] as const;
export type PluginHealthStatus = (typeof PLUGIN_HEALTH_STATUSES)[number];

/** Future hooks are added here — nothing else needs to change to support
 * one; lib/plugins/hooks.ts's onHook/emitHook accept any PluginHookName. */
export const PLUGIN_HOOKS = [
  "onAppStart",
  "onTransactionImported",
  "onTransactionCreated",
  "onBudgetUpdated",
  "onForecastUpdated",
  "onRecurringDetected",
  "onFeedGenerated",
  "onWorkflowExecuted",
  "onQueryExecuted",
] as const;
export type PluginHookName = (typeof PLUGIN_HOOKS)[number];

export const PLUGIN_LIFECYCLE_STATUSES = ["installed", "enabled", "disabled", "uninstalled"] as const;
export type PluginLifecycleStatus = (typeof PLUGIN_LIFECYCLE_STATUSES)[number];

export interface PluginHealth {
  status: PluginHealthStatus;
  message: string;
  checkedAt: string; // ISO 8601
}

/**
 * Every plugin must implement this. Plugins never import each other
 * directly or reach into engine internals — they only communicate through
 * the hooks (lib/plugins/hooks.ts) and the small published extension
 * points each core engine exposes (e.g. lib/feed/engine.ts's
 * registerFeedContributor, lib/workflows/step.ts's registerStepHandler).
 */
export interface Plugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  /** Other plugin ids this one requires — checked before initialize() is
   * called; an unmet dependency leaves the plugin registered but inert. */
  dependencies?: string[];

  initialize(): void | Promise<void>;
  shutdown(): void | Promise<void>;
  register(): void | Promise<void>;
  unregister(): void | Promise<void>;
  health(): PluginHealth | Promise<PluginHealth>;
  capabilities(): PluginCapability[];
}

/**
 * A read-only, JSON-serializable snapshot of one plugin — combines the
 * live instance's static fields with the persisted enabled/health/
 * timestamp state lib/plugins/registry.ts tracks separately (Plugin
 * objects themselves aren't serializable: initialize/shutdown/etc. are
 * functions). This is what the Registry section and the /plugins
 * dashboard actually read.
 */
export interface PluginRecord {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  capabilities: PluginCapability[];
  dependencies: string[];
  enabled: boolean;
  status: PluginLifecycleStatus;
  health: PluginHealth;
  installedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
