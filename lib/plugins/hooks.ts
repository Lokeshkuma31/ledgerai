import type { PluginHookName } from "@/types/plugin";

export type PluginHookHandler<T = unknown> = (payload: T) => void | Promise<void>;

const handlers = new Map<PluginHookName, Set<PluginHookHandler>>();

/**
 * Registers a handler for a lifecycle hook — the published mechanism
 * plugins react through instead of importing an engine's internals
 * directly. Returns an unregister function. Adding a new hook is just a
 * new PluginHookName entry in types/plugin.ts; nothing here changes.
 */
export function onHook<T>(hook: PluginHookName, handler: PluginHookHandler<T>): () => void {
  const set = handlers.get(hook) ?? new Set<PluginHookHandler>();
  set.add(handler as PluginHookHandler);
  handlers.set(hook, set);
  return () => {
    set.delete(handler as PluginHookHandler);
  };
}

/**
 * Fires a hook for every registered handler. Each handler runs
 * independently and inside its own try/catch — one plugin's broken
 * handler must never stop another plugin's handler (or the caller) from
 * running.
 */
export async function emitHook<T>(hook: PluginHookName, payload: T): Promise<void> {
  const set = handlers.get(hook);
  if (!set || set.size === 0) return;
  for (const handler of set) {
    try {
      await handler(payload);
    } catch (error) {
      console.error(`Plugin hook handler for "${hook}" failed:`, error);
    }
  }
}

export function hookHandlerCount(hook: PluginHookName): number {
  return handlers.get(hook)?.size ?? 0;
}

export function clearHooks(): void {
  handlers.clear();
}
