import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";

/** The one place Server Components/Actions/Route Handlers resolve "who is
 * signed in" — every dashboard page and the Connection Hub route
 * handlers/actions call this rather than reading Better Auth's session API
 * directly, so there's a single spot to change if the resolution strategy
 * ever needs to. `middleware.ts` already guarantees a session exists for
 * every route this is called from, but callers should still treat the
 * return type as nullable rather than asserting it. */
export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

/** Every domain table (Transaction, Budget, Goal, ...) is scoped to
 * Organization rather than User (see prisma/schema.prisma), so this is the
 * counterpart to getCurrentUserId() that domain repositories/services need.
 * Every user has exactly one personal Organization auto-created at sign-up
 * (see lib/auth/better-auth.ts's databaseHooks.user.create.after) — team
 * support will need this to resolve an *active* membership instead of just
 * the first one, but there is only ever one today. */
export async function getCurrentOrganizationId(): Promise<string | null> {
  const membership = await getCurrentMembership();
  return membership?.organizationId ?? null;
}

export interface CurrentMembership {
  organizationId: string;
  organizationName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

/** organizationId + role in one query — the piece Better Auth's own
 * session object has no concept of (it only knows identity, not
 * organization membership). GET /api/me is the one Route Handler that
 * exposes this to the client; nothing else needs to duplicate this query. */
export async function getCurrentMembership(): Promise<CurrentMembership | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true, role: true, organization: { select: { name: true } } },
  });
  if (!membership) return null;
  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role,
  };
}
