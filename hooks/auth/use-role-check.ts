"use client";

import { useCurrentUser } from "@/hooks/auth/use-current-user";
import type { CurrentUserResponse } from "@/app/api/me/route";

type Role = CurrentUserResponse["role"];

// Matches prisma/schema.prisma's MembershipRole ordering — a role check
// is "at least this level" (an OWNER passes a MEMBER-gated check), not an
// exact match, the standard RBAC convention.
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export interface RoleCheckResult {
  /** True once loaded and the current role meets `requiredRole`; false
   * while loading (never a false positive during the loading window) or
   * on any error, including a genuine 401. */
  hasAccess: boolean;
  isLoading: boolean;
  role: Role | null;
  error: ReturnType<typeof useCurrentUser>["error"];
}

/** Gates UI on organization role — e.g. hiding a "Delete workspace"
 * button from a VIEWER. This is a UX convenience only, never the actual
 * authorization boundary: every mutating Route Handler/Server Action
 * must independently re-check the role server-side (a client-side hook
 * can't stop a direct API call), the same defense-in-depth principle
 * middleware.ts's own comment documents for session checks. */
export function useRoleCheck(requiredRole: Role): RoleCheckResult {
  const query = useCurrentUser();
  const role = query.data?.role ?? null;
  const hasAccess = role !== null && ROLE_RANK[role] >= ROLE_RANK[requiredRole];

  return {
    hasAccess: !query.isLoading && !query.error && hasAccess,
    isLoading: query.isLoading,
    role,
    error: query.error,
  };
}
