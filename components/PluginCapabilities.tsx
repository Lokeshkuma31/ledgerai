import type { PluginCapability } from "@/types/plugin";

const CAPABILITY_LABELS: Record<PluginCapability, string> = {
  "transaction-source": "Transaction Source",
  "workflow-step": "Workflow Step",
  "feed-generator": "Feed Generator",
  "event-generator": "Event Generator",
  "recommendation-provider": "Recommendation Provider",
  "notification-provider": "Notification Provider",
  "import-provider": "Import Provider",
  "search-provider": "Search Provider",
  "dashboard-widget": "Dashboard Widget",
  "settings-page": "Settings Page",
  "background-task": "Background Task",
};

export default function PluginCapabilities({ capabilities }: { capabilities: PluginCapability[] }) {
  if (capabilities.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {capabilities.map((capability) => (
        <span key={capability} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
          {CAPABILITY_LABELS[capability]}
        </span>
      ))}
    </div>
  );
}
