import { NextResponse } from "next/server";
import { getCurrentMembership, getCurrentSession } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/api/errors";
import { handleApiError } from "@/lib/api/error-handler";

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
