import { Card, CardContent } from "@/components/ui/card";
import ConnectorHealthBadge from "@/components/ConnectorHealthBadge";
import type { ConnectorHealth } from "@/lib/banks/types";

export default function ProviderHealth({ health }: { health: ConnectorHealth | null }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Provider Health</span>
          {health && <ConnectorHealthBadge status={health.status} />}
        </div>
        <p className="text-muted-foreground text-xs">{health?.message ?? "Not yet checked."}</p>
      </CardContent>
    </Card>
  );
}
