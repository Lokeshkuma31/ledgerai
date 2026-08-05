import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness: is this process itself still up and able to respond at all?
 * Deliberately makes zero external calls (no DB, no Redis, no R2) — its
 * only job is detecting a hung/deadlocked process, which a check that
 * depends on external services couldn't reliably distinguish from "a
 * dependency is down." That distinction is what /api/readiness and
 * /api/health are for.
 */
export async function GET() {
  return NextResponse.json({ status: "alive", timestamp: new Date().toISOString() });
}
