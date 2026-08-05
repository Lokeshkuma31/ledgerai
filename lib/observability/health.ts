/**
 * Health composition layer — see
 * docs/observability/06-health-monitoring-design.md. Does NOT replace
 * lib/health/checks.ts (database/redis/storage/oauth/backgroundJobs/
 * queue/plugins probes all live there); this module only aggregates them
 * into the one snapshot shape both /api/health's route handler and
 * /admin/observability consume, so the two can never disagree about what
 * "healthy" means.
 */
import "server-only";
import {
  checkBackgroundJobs,
  checkDatabase,
  checkOAuthProviders,
  checkPlugins,
  checkQueueHealth,
  checkRedis,
  checkStorage,
} from "@/lib/health/checks";
import packageJson from "@/package.json";
import { resolveEnvironment } from "./types";

export {
  checkBackgroundJobs,
  checkDatabase,
  checkOAuthProviders,
  checkPlugins,
  checkQueueHealth,
  checkRedis,
  checkStorage,
} from "@/lib/health/checks";

export async function getFullHealthSnapshot() {
  const [database, cache, storage, queue, plugins] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
    checkQueueHealth(),
    checkPlugins(),
  ]);
  const oauth = checkOAuthProviders();
  const backgroundJobs = checkBackgroundJobs();

  // Only database+redis gate overall status — see
  // docs/observability/06-health-monitoring-design.md's "Overall-status
  // semantics" section for why queue/plugin/storage/oauth degradation
  // surfaces without flipping the whole app to "unhealthy".
  const healthy = database.status === "ok" && cache.status === "ok";

  return {
    status: healthy ? ("healthy" as const) : ("unhealthy" as const),
    version: packageJson.version,
    environment: resolveEnvironment(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    timestamp: new Date().toISOString(),
    checks: { database, redis: cache, storage, oauth, backgroundJobs, queue, plugins },
  };
}
