import type { ScheduleType } from "@/types/policy";

export const MORNING_BRIEFING_HOUR = 8;
export const EVENING_BRIEFING_HOUR = 19;
/** Weekly summaries land Sunday evening, ahead of the week starting fresh Monday. */
const WEEKLY_SUMMARY_DAY = 0; // Sunday
const WEEKLY_SUMMARY_HOUR = 18;
const MONTHLY_SUMMARY_HOUR = 18;

function atHourOnOrAfter(now: Date, hour: number): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

function nextWeeklySummaryTime(now: Date): Date {
  const daysUntilTarget = (WEEKLY_SUMMARY_DAY - now.getDay() + 7) % 7;
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilTarget,
    WEEKLY_SUMMARY_HOUR,
    0,
    0,
  );
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

function nextMonthlySummaryTime(now: Date): Date {
  // Last day of the current month, at MONTHLY_SUMMARY_HOUR — day 0 of next
  // month rolls back to the last day of this one.
  const candidate = new Date(now.getFullYear(), now.getMonth() + 1, 0, MONTHLY_SUMMARY_HOUR, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    return new Date(now.getFullYear(), now.getMonth() + 2, 0, MONTHLY_SUMMARY_HOUR, 0, 0);
  }
  return candidate;
}

/** Whichever daily-briefing slot (morning or evening) comes next — the
 * "Include In Daily Briefing" decision doesn't distinguish AM/PM itself,
 * but the Scheduler's ScheduleType does, so rules.ts calls this to pick
 * one concrete schedule type to recommend. */
export function pickDailyBriefingScheduleType(now: Date): "morning-briefing" | "evening-briefing" {
  const morning = atHourOnOrAfter(now, MORNING_BRIEFING_HOUR);
  const evening = atHourOnOrAfter(now, EVENING_BRIEFING_HOUR);
  return morning.getTime() <= evening.getTime() ? "morning-briefing" : "evening-briefing";
}

/**
 * Pure timestamp math — no scheduling service, no timers. Produces only
 * the ISO string a future delivery system (push, email, widget) would read
 * to decide when to act; this engine never acts on it itself.
 */
export function computeRecommendedTime(scheduleType: ScheduleType, now: Date): string {
  switch (scheduleType) {
    case "immediate":
      return now.toISOString();
    case "morning-briefing":
      return atHourOnOrAfter(now, MORNING_BRIEFING_HOUR).toISOString();
    case "evening-briefing":
      return atHourOnOrAfter(now, EVENING_BRIEFING_HOUR).toISOString();
    case "weekly-summary":
      return nextWeeklySummaryTime(now).toISOString();
    case "monthly-summary":
      return nextMonthlySummaryTime(now).toISOString();
    case "custom":
      return now.toISOString();
    default:
      return now.toISOString();
  }
}
