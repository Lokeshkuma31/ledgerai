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
// sliding window keyed by (userId ?? ip) at the call site.
export const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "ratelimit:api",
});

// Dedicated, tighter limiters for sensitive endpoints — see
// docs/security-hardening/05-rate-limiting-strategy.md for the threshold
// rationale behind each one. All use the same sliding-window algorithm as
// apiRateLimit so a burst can't straddle a fixed-window boundary.

/** /api/auth/* (login, sign-up, password reset) — keyed by IP, since
 * there's no session yet at this layer. The classic brute-force/account-
 * enumeration target, so this is the tightest of the sensitive limiters. */
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "ratelimit:auth",
});

/** Connection Hub OAuth authorize + callback routes — keyed by IP. Looser
 * than authRateLimit since a legitimate user connecting Gmail, Outlook,
 * and Yahoo in one sitting is a realistic, non-abusive burst pattern. */
export const oauthCallbackRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, "60 s"),
  prefix: "ratelimit:oauth",
});

/** Document upload presigned-URL issuance — keyed by userId (always
 * resolved before this limiter is checked). Tighter than generic API
 * traffic because each request has a real R2 storage/egress cost. */
export const uploadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "ratelimit:upload",
});

/** Connection Hub Server Actions (disconnect/refresh/rename/health-check)
 * — keyed by userId. These bypass middleware.ts entirely (Server Actions
 * never match the /api/* prefix apiRateLimit is scoped to), so without
 * this they'd have zero rate limiting of any kind — see
 * docs/security-hardening/05-rate-limiting-strategy.md. */
export const connectionMutationRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "ratelimit:connection-mutation",
});
