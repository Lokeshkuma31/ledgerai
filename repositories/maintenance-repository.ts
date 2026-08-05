/**
 * Maintenance Repository — bulk-delete queries backing the job
 * platform's cleanup job (docs/job-platform/06-scheduling-strategy.md
 * §6.2). No domain owned "delete old rows" before now — each scope here
 * is a narrow, additive query, not a new feature.
 */
import { prisma } from "@/lib/db/prisma";

export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}

export async function deleteOldAuditLogs(olderThan: Date): Promise<number> {
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: olderThan } } });
  return result.count;
}

export async function deleteExpiredRecommendations(now: Date = new Date()): Promise<number> {
  const result = await prisma.recommendation.deleteMany({
    where: { status: "EXPIRED" },
  });
  return result.count;
}

export async function deleteOldDismissedFeedItems(olderThan: Date): Promise<number> {
  const result = await prisma.feedItem.deleteMany({
    where: { isDismissed: true, createdAt: { lt: olderThan } },
  });
  return result.count;
}
