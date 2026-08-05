/**
 * Briefing Repository — Postgres persistence for BriefingDeliveryLog.
 * Added for the job platform's summary-generate job
 * (docs/job-platform/06-scheduling-strategy.md §6.3) — no repository
 * existed before; lib/policy/scheduler.ts only ever computed *timing*,
 * nothing persisted a delivery record.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/src/generated/prisma/client";
import type { ScheduleType as PrismaScheduleType } from "@/src/generated/prisma/client";

export type ScheduleType = "MORNING_BRIEFING" | "EVENING_BRIEFING" | "WEEKLY_SUMMARY" | "MONTHLY_SUMMARY";

/** [organizationId, scheduleType, date] is a real DB unique constraint —
 * this upsert is the idempotency guarantee itself, not just a check
 * beforehand (docs/job-platform/07-idempotency-design.md's Briefings
 * section: checked as the very first step, before any assembly work). */
export async function recordDelivery(organizationId: string, scheduleType: ScheduleType, date: Date): Promise<boolean> {
  const day = new Date(date.toISOString().slice(0, 10));
  try {
    await prisma.briefingDeliveryLog.create({
      data: { organizationId, scheduleType: scheduleType as PrismaScheduleType, date: day },
    });
    return true; // newly recorded — safe to proceed with delivery
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false; // unique constraint hit — already delivered today
    }
    throw error;
  }
}
