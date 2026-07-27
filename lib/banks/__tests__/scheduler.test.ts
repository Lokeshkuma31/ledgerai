import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULE, getSyncSchedule, isDueForSync, setSyncSchedule } from "@/lib/banks/scheduler";

beforeEach(() => {
  localStorage.clear();
});

describe("getSyncSchedule / setSyncSchedule", () => {
  it("defaults to disabled with a 60-minute interval", () => {
    expect(getSyncSchedule("some-connector")).toEqual(DEFAULT_SCHEDULE);
  });

  it("persists a configured schedule per connector", () => {
    setSyncSchedule("demo-bank-a", { enabled: true, intervalMinutes: 15 });
    expect(getSyncSchedule("demo-bank-a")).toEqual({ enabled: true, intervalMinutes: 15 });
    expect(getSyncSchedule("demo-bank-b")).toEqual(DEFAULT_SCHEDULE);
  });
});

describe("isDueForSync", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  it("is never due when the schedule is disabled", () => {
    expect(isDueForSync(null, { enabled: false, intervalMinutes: 5 }, now)).toBe(false);
  });

  it("is due when there's no prior sync at all", () => {
    expect(isDueForSync(null, { enabled: true, intervalMinutes: 60 }, now)).toBe(true);
  });

  it("is due once the interval has elapsed since the last sync", () => {
    const schedule = { enabled: true, intervalMinutes: 30 };
    expect(isDueForSync("2026-07-27T11:31:00Z", schedule, now)).toBe(false); // 29 min ago
    expect(isDueForSync("2026-07-27T11:30:00Z", schedule, now)).toBe(true); // exactly 30 min ago
    expect(isDueForSync("2026-07-27T10:00:00Z", schedule, now)).toBe(true); // well past due
  });
});
