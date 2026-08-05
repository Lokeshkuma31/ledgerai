import { NextResponse } from "next/server";
import { checkBackgroundJobs, checkDatabase, checkOAuthProviders, checkRedis, checkStorage } from "@/lib/health/checks";
import packageJson from "@/package.json";

export const runtime = "nodejs";
// Health status must never be served from a cache — every request re-runs
// the live dependency checks below.
export const dynamic = "force-dynamic";

/**
 * Comprehensive health status: database, Redis, object storage, OAuth
 * provider configuration, and background-job wiring, plus version/
 * environment metadata. `/api/readiness` and `/api/liveness` are lighter,
 * narrower-purpose siblings of this endpoint — see
 * docs/security-hardening/01-remediation-plan.md, Priority 5.
 */
export async function GET() {
  const [database, cache, storage] = await Promise.all([checkDatabase(), checkRedis(), checkStorage()]);
  const oauth = checkOAuthProviders();
  const backgroundJobs = checkBackgroundJobs();

  // Only checks that actually gate "can this app safely serve real
  // requests" (database, cache) count toward the overall status — storage/
  // OAuth/background-job being unconfigured is a real gap (surfaced in the
  // response either way) but shouldn't flip the whole app to "unhealthy"
  // for, say, a dev environment that hasn't provisioned R2 yet.
  const healthy = database.status === "ok" && cache.status === "ok";

  const body = {
    status: healthy ? "healthy" : "unhealthy",
    version: packageJson.version,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
    checks: {
      database,
      redis: cache,
      storage,
      oauth,
      backgroundJobs,
    },
  };

  return NextResponse.json(body, { status: healthy ? 200 : 503 });
}
