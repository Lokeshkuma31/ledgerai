import { NextResponse } from "next/server";
import { checkDatabase, checkRedis } from "@/lib/health/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness: can this instance safely accept real traffic right now?
 * Narrower than /api/health — only the two dependencies every request
 * effectively needs (database, cache/rate-limiter) gate this, since this
 * is the check meant for fast, frequent polling by a deploy pipeline or
 * load balancer, not a full dependency inventory.
 */
export async function GET() {
  const [database, cache] = await Promise.all([checkDatabase(), checkRedis()]);
  const ready = database.status === "ok" && cache.status === "ok";

  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", timestamp: new Date().toISOString(), checks: { database, redis: cache } },
    { status: ready ? 200 : 503 },
  );
}
