"use client";

import { cn } from "@/lib/utils";
import type { ChartConfig } from "@/components/ui/chart";

/**
 * A clickable legend driven by a ChartConfig — separate from
 * components/ui/chart.tsx's ChartLegendContent (which only ever renders
 * Recharts' own auto-generated, non-interactive legend payload). Toggling
 * an entry here flips it in/out of the `hidden` set the parent chart passes
 * back into its `<Area hide={...}>`/`<Bar hide={...}>` props — the
 * "cross-highlighting" interaction from the interaction model, done with
 * plain state, no new dependency.
 */
export default function ChartLegend({
  config,
  hidden,
  onToggle,
}: {
  config: ChartConfig;
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-xs">
      {Object.entries(config).map(([key, item]) => {
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={!isHidden}
            className={cn(
              "flex items-center gap-1.5 transition-opacity",
              isHidden && "opacity-40",
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color ?? "var(--muted-foreground)" }}
            />
            <span className="text-muted-foreground">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
