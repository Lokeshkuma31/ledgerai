/**
 * Coach Cache Service — the first real Upstash Redis call site (plan §3
 * item 1): a pure port of lib/coach/cache.ts's get/set-by-signature logic
 * onto Redis instead of localStorage. lib/coach/cache.ts itself —
 * computeCoachSignature (pure) and loadCoachCache/saveCoachCache
 * (localStorage, still called from lib/intelligence/orchestrator.ts, a
 * client-facing path this backend-only pass doesn't touch) — is
 * unchanged; this is the new async path alongside it.
 *
 * Genuinely cache-shaped (unlike AI Memory): the Coach just regenerates on
 * a miss, so a TTL is a safe bound against unbounded growth, not a
 * correctness requirement — the signature itself is what actually
 * invalidates a stale entry.
 */
import { createHash } from "node:crypto";
import { redis } from "@/lib/cache/redis";
import { cacheKeys } from "@/lib/cache/keys";
import type { CoachOutput } from "@/lib/coach/coach";

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface CoachCacheEntry {
  signature: string;
  response: CoachOutput;
}

/** computeCoachSignature's output can be long (concatenates many ids) —
 * hashed here so the Redis key itself stays short and stable. */
function hashSignature(signature: string): string {
  return createHash("sha256").update(signature).digest("hex");
}

export async function getCachedCoachResponse(
  organizationId: string,
  signature: string,
): Promise<CoachOutput | null> {
  const key = cacheKeys.coachResponse(organizationId, hashSignature(signature));
  const entry = await redis.get<CoachCacheEntry>(key);
  if (!entry || entry.signature !== signature) return null;
  return entry.response;
}

export async function setCachedCoachResponse(
  organizationId: string,
  signature: string,
  response: CoachOutput,
): Promise<void> {
  const key = cacheKeys.coachResponse(organizationId, hashSignature(signature));
  const entry: CoachCacheEntry = { signature, response };
  await redis.set(key, entry, { ex: TTL_SECONDS });
}
