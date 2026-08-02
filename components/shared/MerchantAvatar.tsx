import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Deterministic tone palette (hash → bucket) so the same merchant always
 * gets the same color across the app without persisting anything. */
const TONES = [
  "bg-primary/15 text-primary",
  "bg-ai/15 text-ai",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-chart-5/15 text-chart-5",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Initials-based merchant avatar. No real logo source exists anywhere in
 * this app today (no favicon/Clearbit-style lookup) — `logoUrl` is accepted
 * for a caller that already has one, but this component never fetches one
 * itself, since wiring a third-party logo API would leak merchant names to
 * an external service and is a separate privacy/scope decision.
 */
export default function MerchantAvatar({
  name,
  size = "default",
  logoUrl,
  className,
}: {
  name: string;
  size?: "default" | "sm" | "lg";
  logoUrl?: string;
  className?: string;
}) {
  const tone = TONES[hashString(name) % TONES.length];
  return (
    <Avatar size={size} className={className}>
      {logoUrl && <AvatarImage src={logoUrl} alt={name} />}
      <AvatarFallback className={cn("font-semibold", tone)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
