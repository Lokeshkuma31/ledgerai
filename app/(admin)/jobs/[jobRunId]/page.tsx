import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import * as jobService from "@/services/jobs/job-service";
import { CancelJobButton } from "./CancelJobButton";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ jobRunId: string }> }) {
  const { jobRunId } = await params;
  const run = await jobService.getRunById(jobRunId);
  if (!run) notFound();

  const [related, deadLetters] = await Promise.all([
    jobService.listRecentRuns({ correlationId: run.correlationId, limit: 50 }),
    jobService.listDeadLetters({ includeResolved: true, limit: 200 }),
  ]);
  const deadLetter = deadLetters.find((d) => d.jobRunId === run.id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{run.jobType}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={run.status === "COMPLETED" ? "success" : run.status === "RUNNING" ? "info" : run.status === "FAILED" || run.status === "DEAD_LETTER" ? "destructive" : "secondary"}>
              {run.status}
            </Badge>
            {(run.status === "RUNNING" || run.status === "QUEUED" || run.status === "RETRYING") && (
              <CancelJobButton jobRunId={run.id} />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Job ID">{run.id}</Field>
          <Field label="Trigger event">{run.eventName}</Field>
          <Field label="Organization">{run.organizationId ?? "—"}</Field>
          <Field label="Correlation ID">{run.correlationId}</Field>
          <Field label="Attempts">{run.attempt}</Field>
          <Field label="Progress">{run.progress !== null ? `${run.progress}%` : "—"}</Field>
          <Field label="Queued at">{new Date(run.queuedAt).toLocaleString()}</Field>
          <Field label="Started at">{run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</Field>
          <Field label="Completed at">{run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}</Field>
          <Field label="Duration">{run.durationMs !== null ? `${run.durationMs}ms` : "—"}</Field>
          <Field label="Trace ID">{run.traceId ?? "—"}</Field>
          <Field label="Related resources">{run.relatedIds.length > 0 ? run.relatedIds.join(", ") : "—"}</Field>
        </CardContent>
      </Card>

      {run.error != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-sm">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{JSON.stringify(run.error, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {deadLetter && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dead-letter entry</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div>Original run: {deadLetter.originalRunId}</div>
            <div>{deadLetter.resolvedAt ? `Resolved ${new Date(deadLetter.resolvedAt).toLocaleString()} by ${deadLetter.resolvedBy}` : "Unresolved"}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Input</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{JSON.stringify(run.input, null, 2)}</pre>
        </CardContent>
      </Card>

      {run.output != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{JSON.stringify(run.output, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chain (same correlation ID)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {related
            .filter((r) => r.id !== run.id)
            .map((r) => (
              <a key={r.id} href={`/jobs/${r.id}`} className="flex items-center justify-between text-sm hover:underline">
                <span>{r.jobType}</span>
                <Badge variant="outline">{r.status}</Badge>
              </a>
            ))}
          {related.length <= 1 && <p className="text-muted-foreground text-sm">No other jobs share this correlation ID.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
