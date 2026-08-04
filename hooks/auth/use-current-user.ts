"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query/keys";
import { apiClient } from "@/lib/react-query/api-client";
import type { CurrentUserResponse } from "@/app/api/me/route";

/**
 * The one hook every protected page/component uses to answer "who is
 * signed in, and what's their role" — wraps GET /api/me. On a genuine
 * UnauthorizedError, `query.error` carries it (see lib/api/errors.ts);
 * callers (ProtectedRoute, useRoleCheck) branch on `error.code` rather
 * than this hook silently returning null, so a real 500 is never
 * mistaken for "not signed in."
 *
 * staleTime is intentionally long — identity/role changes rarely within
 * a session, and middleware.ts already guarantees a session cookie
 * exists for every protected route before this ever renders.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.currentUser(),
    queryFn: () => apiClient<CurrentUserResponse>("/api/me"),
    staleTime: 5 * 60_000,
    retry: false, // a 401 won't become a 200 on retry
  });
}
