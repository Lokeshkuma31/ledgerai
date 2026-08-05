import * as briefingRepository from "@/repositories/briefing-repository";
import type { ScheduleType } from "@/repositories/briefing-repository";

export type { ScheduleType };

/** Returns true if this delivery was newly recorded (safe to proceed),
 * false if already delivered today for this org/scheduleType. */
export async function recordDelivery(organizationId: string, scheduleType: ScheduleType, date: Date): Promise<boolean> {
  return briefingRepository.recordDelivery(organizationId, scheduleType, date);
}
