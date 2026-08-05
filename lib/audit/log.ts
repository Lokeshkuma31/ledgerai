/**
 * Audit Logging — the one place anything in the app records a
 * security-relevant event (see docs/security-hardening/06-audit-logging-design.md
 * for the action taxonomy and redaction rule). Backed by the existing
 * AuditLog Prisma model via repositories/audit-log-repository.ts.
 *
 * recordAuditEvent() never throws: a logging failure must not break the
 * user-facing operation it's attached to, the same best-effort principle
 * lib/connections/engine.ts already applies to its own cache refresh
 * (`void refreshConnectionCache().catch(() => undefined)`).
 */
import "server-only";
import { createAuditLog, type CreateAuditLogInput } from "@/repositories/audit-log-repository";

export type AuditEventInput = CreateAuditLogInput;

export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    await createAuditLog(event);
  } catch (error) {
    console.error("[audit]", error);
  }
}
