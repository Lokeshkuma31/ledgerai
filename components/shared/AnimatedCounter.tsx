"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MOTION_DURATION } from "@/lib/motion";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Counts from its previous value to `value` whenever `value` changes.
 * Snaps instantly under prefers-reduced-motion rather than merely
 * animating faster — the first component in this app that needs to.
 */
export default function AnimatedCounter({
  value,
  format = (n: number) => Math.round(n).toString(),
  durationMs = MOTION_DURATION.slow,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (to - from) * easeOutCubic(progress));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
    // fromRef intentionally excluded — it's a mutable ref, not render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, reducedMotion]);

  return <span className={className}>{format(display)}</span>;
}
