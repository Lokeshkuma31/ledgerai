import { Card, CardContent } from "@/components/ui/card";
import type { Consent, ConsentStatus } from "@/plugins/account-aggregator/types";

const STATUS_STYLES: Record<ConsentStatus, string> = {
  Pending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Granted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Denied: "bg-destructive/10 text-destructive",
  Expired: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Revoked: "bg-muted text-muted-foreground",
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ConsentCard({ consent }: { consent: Consent | null }) {
  if (!consent) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-muted-foreground text-sm">No consent requested yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">Consent Status</span>
          <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_STYLES[consent.status]}`}>
            {consent.status}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{consent.purpose}</p>
        <div className="flex flex-wrap gap-1">
          {consent.permissions.map((p) => (
            <span key={p} className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs capitalize">
              {p.replace(/-/g, " ")}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Linked Accounts</span>
            <span className="font-semibold">{consent.linkedAccounts.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Expires</span>
            <span className="font-semibold">{formatTimestamp(consent.expiresAt)}</span>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Requested {formatTimestamp(consent.createdAt)} · Last updated {formatTimestamp(consent.lastUpdated)}
        </p>
      </CardContent>
    </Card>
  );
}
