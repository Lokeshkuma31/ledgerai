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
  const { latencyMs, error } = await timed(() => redis.ping());
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
export function checkBackgroundJobs(): CheckResult {
  const credentialsPresent = Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);
  return {
    status: "unconfigured",
    message: credentialsPresent
      ? "Inngest credentials are set, but background job processing is not yet wired into this application."
      : "Background job processing (Inngest) is not yet wired into this application.",
  };
}
