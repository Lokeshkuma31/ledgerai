/**
 * Plugin & Extension Framework — public entry point. Registry, Lifecycle,
 * Hooks, and the Loader stay independent modules internally (each does one
 * job); this file is the only place anything outside lib/plugins/ should
 * import from.
 */
export { loadPlugins, resetLoaderState } from "@/lib/plugins/loader";
export {
  getAllPluginInstances,
  getAllPluginRecords,
  getPluginDependents,
  getPluginInstance,
  getPluginRecord,
  isPluginEnabled,
} from "@/lib/plugins/registry";
export {
  checkPluginHealth,
  checkPluginVersion,
  disablePlugin,
  enablePlugin,
  reloadPlugin,
  uninstallPlugin,
} from "@/lib/plugins/lifecycle";
export { emitHook, hookHandlerCount, onHook } from "@/lib/plugins/hooks";
