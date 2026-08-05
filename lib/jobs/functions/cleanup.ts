/**
 * Cleanup / data retention job — daily cron, one scope per run of the
 * function body (not per-event fan-out; each scope is cheap and
 * independent). See docs/job-platform/06-scheduling-strategy.md §6.2.
 * Idempotent by nature: deleting already-deleted rows is a no-op.
 */
import { registerSchedule } from "@/lib/jobs/scheduler";
import * as maintenanceService from "@/services/maintenance/maintenance-service";

const AUDIT_LOG_RETENTION_DAYS = 180;
const DISMISSED_FEED_RETENTION_DAYS = 30;

export const cleanup = registerSchedule(
  { id: "cleanup", name: "Cleanup & Data Retention", cron: "0 2 * * *", retries: 1 },
  async ({ step }) => {
    const now = new Date();
    const auditCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const feedCutoff = new Date(now.getTime() - DISMISSED_FEED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [sessions, auditLogs, recommendations, feedItems] = await Promise.all([
      step.run("expired-sessions", () => maintenanceService.deleteExpiredSessions(now)),
      step.run("old-audit-logs", () => maintenanceService.deleteOldAuditLogs(auditCutoff)),
      step.run("expired-recommendations", () => maintenanceService.deleteExpiredRecommendations(now)),
      step.run("dismissed-feed-items", () => maintenanceService.deleteOldDismissedFeedItems(feedCutoff)),
    ]);

    return { sessions, auditLogs, recommendations, feedItems };
  },
);
