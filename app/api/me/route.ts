import { NextResponse } from "next/server";
import { getCurrentMembership, getCurrentSession } from "@/lib/auth/session";
import { UnauthorizedError, ValidationError } from "@/lib/api/errors";
import { handleApiError } from "@/lib/api/error-handler";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

export interface CurrentUserResponse {
  user: { id: string; email: string; name: string | null; image: string | null };
  organizationId: string;
  organizationName: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
}

/**
 * The one endpoint that exposes identity + organization + role together —
 * Better Auth's own session object only knows identity, not membership
 * (see lib/auth/session.ts::getCurrentMembership's doc comment). Every
 * domain's "am I signed in / what can I do" React Query hook reads
 * through this single request rather than each hook re-deriving it.
 */
export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) throw new UnauthorizedError();

    const membership = await getCurrentMembership();
    if (!membership) throw new UnauthorizedError("No workspace found for this account.");

    const body: CurrentUserResponse = {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      },
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      role: membership.role,
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Self-service account deletion (DPDP Act 2023 / GDPR-style right to
 * erasure). Requires the caller to re-type their own email as `confirm` in
 * the body — a lightweight guard against a stray click or CSRF-adjacent
 * mistake triggering an irreversible action, matching the confirm-by-typing
 * pattern used for other destructive actions in this app.
 *
 * Deletes the Organization first, then the User, in one transaction — this
 * walks the exact onDelete: Cascade graph already defined in
 * prisma/schema.prisma (Organization cascades to every org-scoped domain
 * table: Transaction, Budget, Goal, Document, Connection history, etc.;
 * User cascades to Session, OAuthAccount, UserPreferences, Connection,
 * AuditLog). Nothing here invents new cascade behavior — it just finally
 * calls the deletion the schema was already built to support.
 *
 * NOTE: every user today owns exactly one personal Organization (see
 * lib/auth/session.ts's getCurrentOrganizationId doc comment) — deleting
 * "the" organization on account deletion is only correct as long as that
 * holds. Before shipping real multi-user teams, this must change to only
 * remove the caller's Membership, not the whole Organization.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) throw new UnauthorizedError();

    const membership = await getCurrentMembership();
    if (!membership) throw new UnauthorizedError("No workspace found for this account.");

    const body = await request.json().catch(() => null);
    const confirm = typeof body?.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
    if (confirm !== session.user.email.toLowerCase()) {
      throw new ValidationError("Type your account email exactly to confirm deletion.");
    }

    await prisma.$transaction([
      prisma.organization.delete({ where: { id: membership.organizationId } }),
      prisma.user.delete({ where: { id: session.user.id } }),
    ]);

    // The AuditLog row itself cascades away with the Organization/User rows
    // it would reference, so this deliberately goes to the structured
    // logger (captured by the existing observability pipeline) instead of
    // the database — the one durable record this action leaves behind.
    logger().info(
      { userId: session.user.id, organizationId: membership.organizationId },
      "[account] user-initiated account deletion completed",
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
