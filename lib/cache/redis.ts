import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createRedisClient(): Redis {
  // Vercel's Upstash marketplace integration names these KV_REST_API_URL /
  // KV_REST_API_TOKEN rather than the UPSTASH_REDIS_REST_URL / _TOKEN names
  // Redis.fromEnv() looks for by default, so the client is constructed
  // explicitly instead of relying on that helper.
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN are not set — provision Upstash Redis first.");
  }
  return new Redis({ url, token });
}

export const redis = globalThis.__redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redis;
}

// General-purpose API rate limiter (see security architecture, plan §7) —
// sliding window keyed by (userId ?? ip) at the call site. Dedicated,
// tighter limiters for sensitive endpoints (OAuth, document upload, AI
// Coach) should be constructed the same way with their own key prefix.
export const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "ratelimit:api",
});
