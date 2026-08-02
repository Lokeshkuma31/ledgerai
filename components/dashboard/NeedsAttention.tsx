import Link from "next/link";
import { Button } from "@/components/ui/button";
import SeverityBadge from "@/components/SeverityBadge";
import type { AttentionItem } from "@/types/attention";

/**
 * The single ranked "what should I do right now" surface — replaces the
 * old pattern of budget risk, bills, sync/connection health, and AI
 * recommendations living in separately-styled, unranked widgets. Backed by
 * lib/attention/aggregator.ts, which has already done the cross-domain
 * ranking; this component only renders the result.
 */
export default function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        All clear — nothing needs your attention right now.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.slice(0, 6).map((item) => (
        <div
          key={item.id}
          className="border-border flex flex-col gap-2.5 border-t py-3 first:border-t-0 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <SeverityBadge severity={item.severity} />
            <div className="min-w-0">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="text-muted-foreground text-xs">{item.summary}</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={item.ctaHref} />}
            className="self-start sm:self-center"
          >
            {item.ctaLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}
