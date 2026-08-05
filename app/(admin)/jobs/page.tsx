import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as jobService from "@/services/jobs/job-service";
import * as metrics from "@/lib/jobs/metrics";
import { RetryDeadLetterButton } from "./RetryDeadLetterButton";
import type { JobStatus } from "@/types/job";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<JobStatus, "secondary" | "success" | "warning" | "destructive" | "outline" | "info"> = {
  QUEUED: "secondary",
  SCHEDULED: "secondary",
  RUNNING: "info",
  RETRYING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
  DEAD_LETTER: "destructive",
};

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

export default async function JobsDashboardPage() {
  const [counts, queueHealth, typeMetrics, recent, deadLetters] = await Promise.all([
    jobService.getStatusCounts(),
    metrics.getQueueHealth(),
    metrics.getJobTypeMetrics(24),
    jobService.listRecentRuns({ limit: 25 }),
    jobService.listDeadLetters({ limit: 10 }),
  ]);

  const statusOrder: JobStatus[] = ["RUNNING", "QUEUED", "SCHEDULED", "RETRYING", "COMPLETED", "FAILED", "CANCELLED", "DEAD_LETTER"];

  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {statusOrder.map((status) => (
          <Card key={status} size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal uppercase tracking-wide">
                {status.replace("_", " ")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{counts[status]}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-normal">Queue depth</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{queueHealth.queueDepth}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-normal">Oldest pending</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{formatMs(queueHealth.oldestPendingAgeMs)}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-normal">Running now</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{queueHealth.runningCount}</CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-muted-foreground text-xs font-normal">Unresolved dead-letter</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{queueHealth.deadLetterCount}</CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Execution metrics (24h)</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead>Avg duration</TableHead>
                <TableHead>Avg queue latency</TableHead>
                <TableHead>Success rate</TableHead>
                <TableHead>Failure rate</TableHead>
                <TableHead>Avg attempts</TableHead>
                <TableHead>Running</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Dead-letter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeMetrics.map((m) => (
                <TableRow key={m.jobType}>
                  <TableCell className="font-medium">{m.jobType}</TableCell>
                  <TableCell>{formatMs(m.avgDurationMs)}</TableCell>
                  <TableCell>{formatMs(m.avgQueueLatencyMs)}</TableCell>
                  <TableCell>{formatPercent(m.successRate)}</TableCell>
                  <TableCell>{formatPercent(m.failureRate)}</TableCell>
                  <TableCell>{m.avgAttempts?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell>{m.runningCount}</TableCell>
                  <TableCell>{m.queuedCount}</TableCell>
                  <TableCell>{m.deadLetterCount}</TableCell>
                </TableRow>
              ))}
              {typeMetrics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground text-center">
                    No job activity in the last 24 hours.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Job type</TableHead>
                <TableHead>Trigger event</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{run.jobType}</TableCell>
                  <TableCell className="text-muted-foreground">{run.eventName}</TableCell>
                  <TableCell>{run.attempt}</TableCell>
                  <TableCell>{formatMs(run.durationMs)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(run.queuedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Link href={`/jobs/${run.id}`} className="text-primary text-xs hover:underline">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-center">
                    No jobs have run yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Dead-letter queue</h2>
        <div className="overflow-x-auto rounded-lg ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Failed at</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deadLetters.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.jobType}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate">
                    {(entry.error as { message?: string })?.message ?? "Unknown error"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <RetryDeadLetterButton deadLetterId={entry.id} />
                  </TableCell>
                </TableRow>
              ))}
              {deadLetters.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center">
                    No unresolved dead-letter jobs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
