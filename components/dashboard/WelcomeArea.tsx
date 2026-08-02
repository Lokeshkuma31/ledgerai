import AnimatedCounter from "@/components/shared/AnimatedCounter";
import StatusDot from "@/components/shared/StatusDot";
import type { ConnectionHealthStatus, ConnectionRecord, ProviderId } from "@/lib/connections/types";
import type { FinancialState } from "@/types/financial-state";

const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Gmail",
  microsoft: "Outlook",
  yahoo: "Yahoo Mail",
};

const HEALTH_TONE: Record<ConnectionHealthStatus, "success" | "warning" | "destructive" | "muted"> = {
  healthy: "success",
  warning: "warning",
  "expired-token": "warning",
  "permission-revoked": "destructive",
  "authentication-failed": "destructive",
  disconnected: "muted",
};

function formatAmount(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The Dashboard's opening band — orientation (greeting, month, connection
 * health) plus the single largest number on the page (net cash flow this
 * month), so hierarchy is established before the metric grid even starts.
 * The AI-authored line always renders (a calm fallback when there's nothing
 * to flag) rather than disappearing the way the old conditional
 * recommendations card did.
 */
export default function WelcomeArea({
  state,
  connections,
}: {
  state: FinancialState;
  connections: ConnectionRecord[];
}) {
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const netCashFlow = state.forecastStatistics.netCashFlow;
  const summary = state.coachSummary?.summary?.trim() || "Nothing urgent — you're on track.";
  const active = connections.filter((c) => c.status !== "disconnected").slice(0, 4);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <div className="font-heading text-muted-foreground text-sm">
          {getGreeting(now)} · {monthLabel}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground text-sm">Net this month</span>
          <AnimatedCounter
            value={netCashFlow}
            format={(v) => `${v >= 0 ? "+" : "-"}${formatAmount(Math.abs(v))}`}
            className={`font-numeric text-3xl font-semibold tracking-tight ${
              netCashFlow >= 0 ? "text-success" : "text-destructive"
            }`}
          />
        </div>
        <p className="from-ai/10 to-card border-ai/30 text-foreground-subtle max-w-prose rounded-xl border bg-gradient-to-br px-3 py-2 text-sm">
          {summary}
        </p>
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
          {active.map((c) => (
            <StatusDot
              key={c.id}
              tone={HEALTH_TONE[c.health.status]}
              live={c.health.status === "healthy"}
              label={PROVIDER_LABELS[c.provider]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
