/**
 * QueryClient factory — one client per browser tab (client-side singleton),
 * a fresh client per request on the server (React Query's own
 * recommendation, avoids leaking cached data across requests/users on a
 * shared server instance). Defaults here are the baseline every domain's
 * hooks inherit; override per-query only when a domain's data genuinely
 * needs a different staleTime (e.g. Coach responses, already cached
 * server-side in Redis, can afford a longer client staleTime than
 * Transactions).
 */
import { QueryClient, isServer } from "@tanstack/react-query";
import { AppError } from "@/lib/api/errors";

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx (validation, auth, not-found, conflict) won't succeed on retry —
  // only retry genuine transient failures (network, 5xx), and only twice.
  if (error instanceof AppError && error.statusCode < 500) return false;
  return failureCount < 2;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** isServer-branched per TanStack's own SSR guidance — a fresh client on
 * the server (React's request boundary already isolates this per-request
 * with the App Router), a module-level singleton in the browser (survives
 * client-side navigation instead of losing the whole cache on every
 * route change). */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
