"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import ProviderCard from "@/components/ProviderCard";
import type { ConnectionRecord, ProviderDescriptor } from "@/lib/connections/types";

/**
 * Renders server-fetched data only — this dashboard has no client-side
 * store to read from (unlike every other framework's dashboard in this
 * app): registry.ts persists via `node:fs`, which cannot be imported from
 * a "use client" file at all. app/connections/page.tsx (a Server
 * Component) is the only place `descriptors`/`connections`/`banner` come
 * from; mutations flow back through Server Actions
 * (lib/connections/actions.ts) called from ProviderCard, which
 * revalidate this route.
 */
export default function ConnectionHub({
  descriptors,
  connections,
  banner,
}: {
  descriptors: ProviderDescriptor[];
  connections: ConnectionRecord[];
  banner: { connected?: string; error?: string; provider?: string };
}) {
  const [dismissed, setDismissed] = useState(false);

  const connectionsByProvider = new Map(connections.map((c) => [c.provider, c]));
  const showBanner = !dismissed && (banner.connected || banner.error);

  return (
    <div className="flex flex-col gap-4">
      {showBanner && (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
            banner.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          }`}
        >
          <span>{banner.error ? banner.error : `${banner.connected} connected successfully.`}</span>
          <Button variant="ghost" size="xs" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {descriptors.map((descriptor) => (
          <ProviderCard key={descriptor.id} descriptor={descriptor} record={connectionsByProvider.get(descriptor.id) ?? null} />
        ))}
      </div>
    </div>
  );
}
