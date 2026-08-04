/**
 * Query History Service — the second real Upstash Redis call site (plan
 * §3 item 2): a pure port of lib/query/history.ts's capped-at-50 list
 * onto a Redis list instead of localStorage. lib/query/history.ts itself
 * is unchanged — still called from components/aicoach/AiCoachPageContent.tsx
 * and lib/index/useFinancialSearch.ts, both client-facing paths this
 * backend-only pass doesn't touch; this is the new async path alongside it.
 */
import { redis } from "@/lib/cache/redis";
import { cacheKeys } from "@/lib/cache/keys";
import type { QueryResult } from "@/types/query";

const MAX_ENTRIES = 50;

/** Newest first. */
export async function getQueryHistory(organizationId: string): Promise<QueryResult[]> {
  const key = cacheKeys.queryHistory(organizationId);
  const raw = await redis.lrange<QueryResult>(key, 0, MAX_ENTRIES - 1);
  return raw;
}

export async function addToQueryHistory(
  organizationId: string,
  result: QueryResult,
): Promise<QueryResult[]> {
  const key = cacheKeys.queryHistory(organizationId);
  await redis.lpush(key, result);
  await redis.ltrim(key, 0, MAX_ENTRIES - 1);
  return getQueryHistory(organizationId);
}

export async function deleteFromQueryHistory(
  organizationId: string,
  id: string,
): Promise<QueryResult[]> {
  const key = cacheKeys.queryHistory(organizationId);
  const all = await getQueryHistory(organizationId);
  const filtered = all.filter((r) => r.id !== id);

  const pipeline = redis.pipeline();
  pipeline.del(key);
  if (filtered.length > 0) {
    // Preserve newest-first order: filtered[0] (newest) must end up as the
    // head of the list, so push oldest-first (reversed) with lpush.
    for (const entry of [...filtered].reverse()) {
      pipeline.lpush(key, entry);
    }
  }
  await pipeline.exec();
  return filtered;
}

export async function clearQueryHistory(organizationId: string): Promise<void> {
  await redis.del(cacheKeys.queryHistory(organizationId));
}
