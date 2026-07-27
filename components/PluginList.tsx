import { Card, CardContent } from "@/components/ui/card";
import PluginCard from "@/components/PluginCard";
import type { PluginRecord } from "@/types/plugin";

export default function PluginList({
  plugins,
  busyPluginIds,
  onToggleEnabled,
  onReload,
  onUninstall,
}: {
  plugins: PluginRecord[];
  busyPluginIds?: Set<string>;
  onToggleEnabled?: (plugin: PluginRecord) => void;
  onReload?: (plugin: PluginRecord) => void;
  onUninstall?: (plugin: PluginRecord) => void;
}) {
  if (plugins.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">No plugins installed yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          isBusy={busyPluginIds?.has(plugin.id)}
          onToggleEnabled={onToggleEnabled}
          onReload={onReload}
          onUninstall={onUninstall}
        />
      ))}
    </div>
  );
}
