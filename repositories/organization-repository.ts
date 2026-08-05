/**
 * Organization Repository — minimal, added for the background job
 * platform's cron-triggered, per-organization fan-out jobs (recurring
 * detection, forecast/budget refresh, analytics, recommendations — see
 * docs/job-platform/06-scheduling-strategy.md §6.2), which need to
 * iterate every active org. No other domain needed a bare org listing
 * before now.
 */
import { prisma } from "@/lib/db/prisma";

export async function listActiveOrganizationIds(): Promise<string[]> {
  const rows = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface OrganizationTimezoneInfo {
  organizationId: string;
  timezone: string;
}

/** Organization has no timezone column today — every org is treated as
 * UTC until one is added. Kept as its own function (rather than inlining
 * "UTC" at call sites) so summary-generate's org-local-time matching
 * (docs/job-platform/06-scheduling-strategy.md §6.3) has a single place
 * to start reading real per-org timezones from once that column exists. */
export async function listOrganizationTimezones(): Promise<OrganizationTimezoneInfo[]> {
  const ids = await listActiveOrganizationIds();
  return ids.map((organizationId) => ({ organizationId, timezone: "UTC" }));
}
