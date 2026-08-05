/**
 * Health Checks — shared dependency-probing logic for app/api/health,
 * app/api/readiness, and app/api/liveness. Kept in one place so the three
 * endpoints can't drift on what "database is healthy" actually means.
 *
 * Every check is honest about what it can and can't verify: OAuth checks
 * confirm credentials are *configured*, not that a live call to the
 * provider succeeds (a live call on every health-check poll would burn
 * provider API quota for no operational benefit); background-job status
 * honestly reports that Inngest is not yet wired into this application at
 * all, regardless of whether its credentials are set — see
 * docs/production-readiness/01-production-architecture.md.
 */
import "server-only";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db/prisma";
import { redis } from "@/lib/cache/redis";
import { r2, R2_BUCKET } from "@/lib/storage/r2";
import * as jobService from "@/services/jobs/job-service";
import * as pluginService from "@/services/plugins/plugin-service";
import { withExternalSpan } from "@/lib/observability/tracing";

export type CheckStatus = "ok" | "error" | "unconfigured";

export interface CheckResult {
  status: CheckStatus;
  message?: string;
  latencyMs?: number;
}

async function timed(fn: () => Promise<unknown>): Promise<{ latencyMs: number; error?: unknown }> {
  const start = Date.now();
  try {
    await fn();
    return { latencyMs: Date.now() - start };
  } catch (error) {
    return { latencyMs: Date.now() - start, error };
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

export async function checkDatabase(): Promise<CheckResult> {
  const { latencyMs, error } = await timed(() => prisma.$queryRaw`SELECT 1`);
  if (error) return { status: "error", message: toMessage(error), latencyMs };
  return { status: "ok", latencyMs };
}

export async function checkRedis(): Promise<CheckResult> {
  const { latencyMs, error } = await timed(() => withExternalSpan("redis.ping", { "redis.command": "ping" }, () => redis.ping()));
  if (error) return { status: "error", message: toMessage(error), latencyMs };
  return { status: "ok", latencyMs };
}

export async function checkStorage(): Promise<CheckResult> {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return { status: "unconfigured", message: "R2 credentials are not set." };
  }
  const { latencyMs, error } = await timed(() => r2.send(new HeadBucketCommand({ Bucket: R2_BUCKET })));
  if (error) return { status: "error", message: toMessage(error), latencyMs };
  return { status: "ok", latencyMs };
}

export interface OAuthProviderChecks {
  betterAuthGoogle: CheckStatus;
  connectionHubGoogle: CheckStatus;
  connectionHubMicrosoft: CheckStatus;
  connectionHubYahoo: CheckStatus;
}

function configured(...vars: (string | undefined)[]): CheckStatus {
  return vars.every(Boolean) ? "ok" : "unconfigured";
}

export function checkOAuthProviders(): OAuthProviderChecks {
  return {
    betterAuthGoogle: configured(process.env.BETTER_AUTH_GOOGLE_CLIENT_ID, process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET),
    connectionHubGoogle: configured(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    connectionHubMicrosoft: configured(process.env.MICROSOFT_OAUTH_CLIENT_ID, process.env.MICROSOFT_OAUTH_CLIENT_SECRET),
    connectionHubYahoo: configured(process.env.YAHOO_OAUTH_CLIENT_ID, process.env.YAHOO_OAUTH_CLIENT_SECRET),
  };
}

/** Deliberately always reports unconfigured/not-wired — Inngest has no
 * client, no functions, and no /api/inngest route anywhere in this
 * codebase yet, independent of whether its env vars happen to be set.
 * Pretending otherwise here would make this endpoint lie about the one
 * thing docs/production-readiness/01 flags as the biggest production gap. */
/**
 * Wired to the real job platform (lib/jobs/*, app/api/inngest/route.ts) —
 * see docs/job-platform/. "unconfigured" now only reflects genuinely
 * missing credentials, not the absence of a client/functions/route, which
 * existed for every prior check in this file's history.
 */
export function checkBackgroundJobs(): CheckResult {
  const credentialsPresent = Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);
  if (!credentialsPresent) {
    return {
      status: "unconfigured",
      message: "INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY are not set — the job platform is wired but cannot reach Inngest.",
    };
  }
  return {
    status: "ok",
    message: "Inngest client, functions, and /api/inngest route are configured.",
  };
}

/** Mirrors the alert matrix's queue-growth threshold
 * (docs/observability/07-alert-matrix.md #5) — 500 pending jobs or a
 * 15-minute-old oldest-pending job flips this to "degraded". */
const QUEUE_DEPTH_WARN = 500;
const OLDEST_PENDING_WARN_MS = 15 * 60 * 1000;

export interface QueueCheckResult extends CheckResult {
  queueDepth: number;
  oldestPendingAgeMs: number | null;
  runningCount: number;
  deadLetterCount: number;
}

/** Wraps lib/jobs/metrics.ts's already-implemented getQueueHealth() —
 * see docs/observability/06-health-monitoring-design.md. No new
 * aggregation logic; this just exposes the existing computation through
 * the health-check interface, alongside database/redis/storage/oauth. */
export async function checkQueueHealth(): Promise<QueueCheckResult> {
  const { latencyMs, error } = await timed(() => jobService.getQueueHealth());
  if (error) {
    return { status: "error", message: toMessage(error), latencyMs, queueDepth: 0, oldestPendingAgeMs: null, runningCount: 0, deadLetterCount: 0 };
  }
  const health = await jobService.getQueueHealth();
  const degraded = health.deadLetterCount > 0 || health.queueDepth > QUEUE_DEPTH_WARN || (health.oldestPendingAgeMs ?? 0) > OLDEST_PENDING_WARN_MS;
  return {
    status: degraded ? "error" : "ok",
    message: degraded ? "Queue depth, oldest-pending age, or dead-letter count exceeds warning thresholds." : undefined,
    latencyMs,
    queueDepth: health.queueDepth,
    oldestPendingAgeMs: health.oldestPendingAgeMs,
    runningCount: health.runningCount,
    deadLetterCount: health.deadLetterCount,
  };
}

/** Reads the plugin registry's last-recorded health — populated every 30
 * minutes by the existing pluginHealthCheck Inngest cron job
 * (lib/jobs/functions/plugins.ts). No new health-probing logic here, just
 * surfacing what's already collected. */
export async function checkPlugins(): Promise<Record<string, CheckResult>> {
  const records = await pluginService.getAllPluginRecords();
  return Object.fromEntries(
    records.map((record) => [
      record.id,
      {
        status: record.health.status === "healthy" ? "ok" : record.health.status === "warning" ? "unconfigured" : "error",
        message: record.health.message,
      } satisfies CheckResult,
    ]),
  );
}
