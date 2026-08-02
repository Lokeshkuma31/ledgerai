import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionRecord } from "@/lib/connections/types";

/** A lightweight summary + link-out rather than duplicating the full
 * Connection Hub (which already has its own real OAuth flows, provider
 * cards, and health details at /connections) inline here. */
export default function ConnectionsSettingsCard({ connections }: { connections: ConnectionRecord[] }) {
  const active = connections.filter((c) => c.status !== "disconnected");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connections</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {active.length === 0
            ? "No accounts connected yet."
            : `${active.length} account${active.length === 1 ? "" : "s"} connected.`}
        </p>
        <Button nativeButton={false} render={<Link href="/connections" />} className="w-fit">
          Manage Connections
        </Button>
      </CardContent>
    </Card>
  );
}
