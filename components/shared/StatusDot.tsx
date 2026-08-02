"use client";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<"success" | "warning" | "destructive" | "muted", string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground",
};

/**
 * A status indicator dot. `live` adds a pulsing ring (Tailwind's built-in
 * animate-ping) for genuinely active states (an in-progress sync, a
 * healthy live connection) — set it only for those, not decoratively.
 * Under prefers-reduced-motion the ring never renders, leaving a plain
 * static dot (plus its label, if given) rather than a frozen mid-pulse ring.
 */
export default function StatusDot({
  tone = "success",
  live = false,
  label,
  className,
}: {
  tone?: "success" | "warning" | "destructive" | "muted";
  live?: boolean;
  label?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const shouldPulse = live && !reducedMotion;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative inline-flex size-2 shrink-0">
        {shouldPulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              TONE_CLASSES[tone],
            )}
          />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", TONE_CLASSES[tone])} />
      </span>
      {label && <span className="text-muted-foreground text-xs">{label}</span>}
    </span>
  );
}
