import { Badge } from "@/components/ui/badge";
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
        <Badge key={capability} variant="secondary">
          {CAPABILITY_LABELS[capability]}
        </Badge>
      ))}
    </div>
  );
}
