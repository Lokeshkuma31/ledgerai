/**
 * Centralized cache-key builders (plan §4, §6, §8). Every cache entry is
 * derived/rebuildable — never the sole source of truth — and every key is
 * environment-prefixed so preview deployments can't collide with
 * production or with each other in a shared Upstash database.
 */

const ENV_PREFIX = process.env.VERCEL_ENV === "production" ? "prod" : `preview:${process.env.VERCEL_GIT_COMMIT_REF ?? "dev"}`;

function key(...parts: (string | number)[]): string {
  return [ENV_PREFIX, ...parts].join(":");
}

export const cacheKeys = {
  merchantLookup: (organizationId: string, normalizedName: string) => key("merchant", organizationId, normalizedName),
  forecast: (organizationId: string, date: string) => key("forecast", organizationId, date),
  dashboard: (organizationId: string, date: string) => key("dashboard", organizationId, date),
  searchQuery: (organizationId: string, queryHash: string) => key("search", organizationId, queryHash),
  coachResponse: (organizationId: string, signatureHash: string) => key("coach", organizationId, signatureHash),
  queryHistory: (organizationId: string) => key("query-history", organizationId),
};

export const lockKeys = {
  sync: (connectionId: string) => key("lock", "sync", connectionId),
  workflowRun: (organizationId: string, workflowKey: string) => key("lock", "workflow", organizationId, workflowKey),
};

export const oauthStateKeys = {
  connectionHub: (state: string) => key("oauth-state", "connections", state),
  betterAuth: (state: string) => key("oauth-state", "auth", state),
};
