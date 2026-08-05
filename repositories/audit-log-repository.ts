/**
 * Audit Log Repository — the only module that writes to the AuditLog
 * table (prisma/schema.prisma). Mirrors repositories/connection-repository.ts's
 * pattern: thin, Prisma-only, no business logic. lib/audit/log.ts is the
 * caller-facing surface (it adds the "never throw" guarantee); this file
 * stays a plain, throwing data-access function so that guarantee lives in
 * exactly one place.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/src/generated/prisma/client";

export interface CreateAuditLogInput {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  organizationId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      before: input.before === undefined ? Prisma.DbNull : (input.before as Prisma.InputJsonValue),
      after: input.after === undefined ? Prisma.DbNull : (input.after as Prisma.InputJsonValue),
      ip: input.ip ?? null,
    },
  });
}
