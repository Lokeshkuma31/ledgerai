import { NextResponse } from "next/server";
import { getFullHealthSnapshot } from "@/lib/observability/health";

export const runtime = "nodejs";
// Health status must never be served from a cache — every request re-runs
// the live dependency checks below.
export const dynamic = "force-dynamic";

/**
 * Comprehensive health status: database, Redis, object storage, OAuth
 * provider configuration, background-job wiring, queue depth, and plugin
 * health, plus version/environment metadata. `/api/readiness` and
 * `/api/liveness` are lighter, narrower-purpose siblings of this endpoint
 * — see docs/security-hardening/01-remediation-plan.md, Priority 5, and
 * docs/observability/06-health-monitoring-design.md.
 *
 * Aggregation itself lives in lib/observability/health.ts's
 * getFullHealthSnapshot() so this route and /admin/observability can
 * never disagree about what "healthy" means.
 */
export async function GET() {
  const snapshot = await getFullHealthSnapshot();
  return NextResponse.json(snapshot, { status: snapshot.status === "healthy" ? 200 : 503 });
}
