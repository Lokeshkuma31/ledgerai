import { getFullHealthSnapshot } from "@/lib/observability/health";
import { getRequestMetricsSnapshot } from "@/lib/observability/metrics";
import { capture } from "@/lib/observability/analytics";
import { requireUserId, getCurrentMembership } from "@/lib/auth/session";
import * as jobService from "@/services/jobs/job-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type BadgeVariant = "secondary" | "success" | "warning" | "destructive" | "outline" | "info";

function statusVariant(status: string): BadgeVariant {
  if (status === "ok" || status === "healthy" || status === "ready" || status === "alive") return "success";
  if (status === "unconfigured" || status === "warning" || status === "degraded") return "warning";
  return "destructive";
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatPercent(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`;
}

/**
 * /admin/observability — system health, request rate/errors, background
 * jobs, queues, provider/plugin/worker health, and slow requests. See
 * docs/observability/06-health-monitoring-design.md (health snapshot is
 * the same lib/observability/health.ts::getFullHealthSnapshot() /api/health
 * uses, so this page and that endpoint can never disagree) and
 * docs/observability/10-production-monitoring-checklist.md's admin
 * dashboard checklist. Gated by the same OWNER-role check as /jobs (see
 * app/(admin)/layout.tsx) — no separate access-control logic here.
 */
export default async function ObservabilityDashboardPage() {
  const [health, typeMetrics, failedRuns] = await Promise.all([
    getFullHealthSnapshot(),
    jobService.getJobTypeMetrics(24),
    jobService.listRecentRuns({ status: "FAILED", limit: 10 }),
  ]);
  const requestMetrics = getRequestMetricsSnapshot();

  const userId = await requireUserId();
  const membership = await getCurrentMembership();
  capture("admin_observability_viewed", userId, { role: membership?.role ?? "OWNER" });

  const oauthEntries = Object.entries(health.checks.oauth);
  const pluginEntries = Object.entries(health.checks.plugins);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex items-center gap-3">
        <Badge variant={statusVariant(health.status)} className="text-sm">
          {health.status}
        </Badge>
        <span className="text-muted-foreground text-sm">
          v{health.version} · {health.environment} · checked {new Date(health.timestamp).toLocaleTimeString()}
        </span>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Dependency health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Database</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant={statusVariant(health.checks.database.status)}>{health.checks.database.status}</Badge>
              <span className="text-muted-foreground text-xs">{formatMs(health.checks.database.latencyMs)}</span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Redis</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant={statusVariant(health.checks.redis.status)}>{health.checks.redis.status}</Badge>
              <span className="text-muted-foreground text-xs">{formatMs(health.checks.redis.latencyMs)}</span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Storage</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant={statusVariant(health.checks.storage.status)}>{health.checks.storage.status}</Badge>
              <span className="text-muted-foreground text-xs">{formatMs(health.checks.storage.latencyMs)}</span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Background jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={statusVariant(health.checks.backgroundJobs.status)}>{health.checks.backgroundJobs.status}</Badge>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Queue</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Badge variant={statusVariant(health.checks.queue.status)}>{health.checks.queue.status}</Badge>
              <span className="text-muted-foreground text-xs">
                {health.checks.queue.queueDepth} queued · {health.checks.queue.deadLetterCount} dead-letter
              </span>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">Worker (24h success)</CardTitle>
            </CardHeader>
            <CardContent>
              {formatPercent(
                typeMetrics.length
                  ? typeMetrics.reduce((sum, m) => sum + (m.successRate ?? 0), 0) / typeMetrics.length
                  : null,
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Request traffic (last {Math.round(requestMetrics.windowMs / 60_000)}m, this instance)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">Requests</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{requestMetrics.totalRequests}</CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">Req/min</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{requestMetrics.requestsPerMinute.toFixed(1)}</CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">Error rate</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{formatPercent(requestMetrics.errorRate)}</CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">p95 latency</CardTitle>
            </CardHeader>
            <CardContent className="text-xl font-semibold">{formatMs(requestMetrics.p95DurationMs)}</CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Slow requests (&gt;2s)</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestMetrics.slowRequests.map((r, i) => (
                <TableRow key={`${r.route}-${r.timestamp}-${i}`}>
                  <TableCell className="font-medium">{r.route}</TableCell>
                  <TableCell className="text-muted-foreground">{r.method}</TableCell>
                  <TableCell>
                    <Badge variant={r.statusCode >= 500 ? "destructive" : "secondary"}>{r.statusCode}</Badge>
                  </TableCell>
                  <TableCell>{formatMs(r.durationMs)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</TableCell>
                </TableRow>
              ))}
              {requestMetrics.slowRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    No slow requests recorded on this instance yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Job execution metrics (24h)</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead>Avg duration</TableHead>
                <TableHead>Success rate</TableHead>
                <TableHead>Failure rate</TableHead>
                <TableHead>Dead-letter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeMetrics.map((m) => (
                <TableRow key={m.jobType}>
                  <TableCell className="font-medium">{m.jobType}</TableCell>
                  <TableCell>{formatMs(m.avgDurationMs)}</TableCell>
                  <TableCell>{formatPercent(m.successRate)}</TableCell>
                  <TableCell>{formatPercent(m.failureRate)}</TableCell>
                  <TableCell>{m.deadLetterCount}</TableCell>
                </TableRow>
              ))}
              {typeMetrics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    No job activity in the last 24 hours.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent job failures</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead>Correlation ID</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.jobType}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{run.correlationId}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
                    {(run.error as { message?: string } | null)?.message ?? "Unknown error"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {failedRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center">
                    No failed jobs in recent history.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold">Provider (OAuth) health</h2>
          <div className="overflow-x-auto rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oauthEntries.map(([name, status]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(status)}>{status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">Plugin health</h2>
          <div className="overflow-x-auto rounded-lg ring-1 ring-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plugin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pluginEntries.map(([id, result]) => (
                  <TableRow key={id}>
                    <TableCell className="font-medium">{id}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{result.message ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {pluginEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      No plugins registered.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
    </div>
  );
}
