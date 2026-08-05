/**
 * Ownership assertion — the single, reusable check every mutation of a
 * user-owned resource (Connection Hub today; any future per-user resource
 * tomorrow) must call before acting. Deliberately framework-agnostic (no
 * next/headers, no next/navigation): callers resolve the current user id
 * themselves (e.g. via lib/auth/session.ts's requireUserId() in a Route
 * Handler or Server Action) and pass it in explicitly, so this stays safe
 * to import from engine-layer modules that need to remain plain-function
 * testable — see lib/connections/engine.ts's own doc comment on why that
 * matters there.
 */
import { ForbiddenError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit/log";

export interface OwnershipCheckInput {
  /** The resource's actual owner, as stored. */
  resourceUserId: string;
  /** The caller attempting the operation, from a resolved session. */
  currentUserId: string;
  /** Audit taxonomy fields — see docs/security-hardening/06-audit-logging-design.md */
  entityType: string;
  entityId: string;
}

/**
 * Throws ForbiddenError — and records a `<entityType>.access_denied`
 * audit event — when the resource's owner doesn't match the caller.
 * Resolves silently (no-op) when it does.
 */
export async function assertOwnership(input: OwnershipCheckInput): Promise<void> {
  if (input.resourceUserId === input.currentUserId) return;

  await recordAuditEvent({
    action: `${input.entityType}.access_denied`,
    entityType: input.entityType,
    entityId: input.entityId,
    userId: input.currentUserId,
  });

  throw new ForbiddenError();
}
