import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import PluginCapabilities from "@/components/PluginCapabilities";
import PluginHealthBadge from "@/components/PluginHealthBadge";
import type { PluginRecord } from "@/types/plugin";

/** Plugins with their own dedicated dashboard page (see AGENTS.md's plugin
 * milestones) — most built-in plugins don't have one, so this stays empty
 * for them and PluginCard renders no "Manage" link at all. */
const PLUGIN_MANAGEMENT_URLS: Partial<Record<string, string>> = {
  "android-sms": "/plugins/android-sms",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PluginCard({
  plugin,
  isBusy,
  onToggleEnabled,
  onReload,
  onUninstall,
}: {
  plugin: PluginRecord;
  isBusy?: boolean;
  onToggleEnabled?: (plugin: PluginRecord) => void;
  onReload?: (plugin: PluginRecord) => void;
  onUninstall?: (plugin: PluginRecord) => void;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{plugin.name}</span>
            <span className="text-muted-foreground text-xs">
              v{plugin.version} · {plugin.author}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <PluginHealthBadge status={plugin.health.status} />
            <span
              className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
                plugin.enabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {plugin.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
        <p className="text-sm">{plugin.description}</p>
        <PluginCapabilities capabilities={plugin.capabilities} />
        {plugin.dependencies.length > 0 && (
          <p className="text-muted-foreground text-xs">Depends on: {plugin.dependencies.join(", ")}</p>
        )}
        <p className="text-muted-foreground text-xs">{plugin.health.message}</p>
        <p className="text-muted-foreground text-xs">
          Installed {formatTimestamp(plugin.installedAt)} · Updated {formatTimestamp(plugin.updatedAt)}
        </p>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {PLUGIN_MANAGEMENT_URLS[plugin.id] && (
            <Button variant="outline" size="xs" render={<Link href={PLUGIN_MANAGEMENT_URLS[plugin.id]!} />}>
              Manage
            </Button>
          )}
          {onReload && (
            <Button variant="outline" size="xs" onClick={() => onReload(plugin)} disabled={isBusy}>
              Reload
            </Button>
          )}
          {onToggleEnabled && (
            <Button variant="outline" size="xs" onClick={() => onToggleEnabled(plugin)} disabled={isBusy}>
              {plugin.enabled ? "Disable" : "Enable"}
            </Button>
          )}
          {onUninstall && (
            <Button variant="destructive" size="xs" onClick={() => onUninstall(plugin)} disabled={isBusy}>
              Uninstall
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
