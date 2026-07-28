import { Button } from "@/components/ui/button";
import type { ProviderId } from "@/lib/connections/types";

/**
 * Always a plain `<a>` (never next/link's `<Link>`): this href points at
 * a Route Handler that immediately redirects to the provider's real
 * consent screen, and Link's default prefetching would otherwise risk
 * firing that GET request just from a hover/viewport-visibility event.
 */
export default function ConnectButton({ provider, reconnectId, label }: { provider: ProviderId; reconnectId?: string; label?: string }) {
  const href = reconnectId ? `/api/connections/${provider}/authorize?reconnect=${reconnectId}` : `/api/connections/${provider}/authorize`;
  return (
    <Button size="xs" nativeButton={false} render={<a href={href} />}>
      {label ?? (reconnectId ? "Reconnect" : "Connect")}
    </Button>
  );
}
