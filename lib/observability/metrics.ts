/**
 * Metrics — OpenTelemetry counters/histograms for every instrumented
 * system, plus a small in-process ring buffer that backs
 * /admin/observability's "request rate / error rate / slow requests"
 * panels without standing up a separate metrics query backend for this
 * phase. See docs/observability/02-telemetry-strategy.md and
 * docs/observability/01-architecture-diagram.md's signal-to-store table.
 *
 * The ring buffer is per-instance, in-memory state — on Vercel's Fluid
 * Compute that means it reflects one warm instance's recent traffic, not
 * a cluster-wide view. That's an accepted limitation for this phase (see
 * docs/observability/10-production-monitoring-checklist.md); a real
 * metrics backend (OTel collector + Prometheus/Datadog/etc.) is the
 * eventual replacement, at which point the dashboard swaps its data
 * source without changing its shape.
 */
import "server-only";
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("ledgerai");

export const httpRequestDuration = meter.createHistogram("http.request.duration_ms", {
  description: "HTTP request duration in milliseconds",
  unit: "ms",
});
export const actionDuration = meter.createHistogram("action.duration_ms", {
  description: "Server Action duration in milliseconds",
  unit: "ms",
});
export const dbQueryDuration = meter.createHistogram("db.query.duration_ms", {
  description: "Prisma query duration in milliseconds",
  unit: "ms",
});
export const jobDuration = meter.createHistogram("job.duration_ms", {
  description: "Background job execution duration in milliseconds",
  unit: "ms",
});
export const cacheHitCounter = meter.createCounter("cache.hits");
export const cacheMissCounter = meter.createCounter("cache.misses");
export const errorCounter = meter.createCounter("errors");
export const authSuccessCounter = meter.createCounter("auth.success");
export const authFailureCounter = meter.createCounter("auth.failure");

export function recordDbLatency(model: string, action: string, durationMs: number, failed: boolean): void {
  dbQueryDuration.record(durationMs, { "db.model": model, "db.action": action, failed });
}

export function recordCacheResult(hit: boolean, key: string): void {
  (hit ? cacheHitCounter : cacheMissCounter).add(1, { "cache.key_prefix": key.split(":")[0] ?? "unknown" });
}

export function recordJobDuration(jobType: string, durationMs: number, status: "success" | "failed"): void {
  jobDuration.record(durationMs, { "job.type": jobType, "job.status": status });
}

export function recordAuthResult(success: boolean, method: string): void {
  (success ? authSuccessCounter : authFailureCounter).add(1, { "auth.method": method });
}

export function recordError(errorCode: string, route?: string): void {
  errorCounter.add(1, { "error.code": errorCode, route: route ?? "unknown" });
}

// --- in-process recent-request ring buffer (admin dashboard) ---------------

export interface RecentRequestEntry {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
  correlationId?: string;
}

const RING_BUFFER_SIZE = 500;
const recentRequests: RecentRequestEntry[] = [];
let ringIndex = 0;

export function recordHttpRequest(entry: RecentRequestEntry): void {
  httpRequestDuration.record(entry.durationMs, { "http.route": entry.route, "http.status_code": entry.statusCode });
  if (entry.statusCode >= 500) recordError("INTERNAL_ERROR", entry.route);

  if (recentRequests.length < RING_BUFFER_SIZE) {
    recentRequests.push(entry);
  } else {
    recentRequests[ringIndex] = entry;
    ringIndex = (ringIndex + 1) % RING_BUFFER_SIZE;
  }
}

export function recordActionResult(name: string, durationMs: number, success: boolean): void {
  actionDuration.record(durationMs, { "action.name": name, success });
  if (!success) recordError("INTERNAL_ERROR", `action:${name}`);
}

/** Snapshot for /admin/observability — request rate, error rate, and p95
 * latency over the buffered window. Not a substitute for a real metrics
 * backend (see module header), but sufficient for a single-instance
 * operational view. */
export function getRequestMetricsSnapshot(windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  const windowEntries = recentRequests.filter((e) => now - e.timestamp <= windowMs);
  const total = windowEntries.length;
  const errors = windowEntries.filter((e) => e.statusCode >= 500).length;
  const durations = windowEntries.map((e) => e.durationMs).sort((a, b) => a - b);
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : 0;
  const slow = windowEntries.filter((e) => e.durationMs > 2000).sort((a, b) => b.durationMs - a.durationMs).slice(0, 20);

  return {
    windowMs,
    totalRequests: total,
    errorRate: total > 0 ? errors / total : 0,
    p95DurationMs: p95,
    requestsPerMinute: total / (windowMs / 60_000),
    slowRequests: slow,
  };
}
