import { describe, expect, it } from "vitest";
import { buildKey, dayBucket, hourBucket, halfHourBucket } from "@/lib/jobs/idempotency";

describe("buildKey", () => {
  it("joins parts with a colon", () => {
    expect(buildKey("sync-started", "org_1", "gmail")).toBe("sync-started:org_1:gmail");
  });

  it("skips undefined/null/empty parts rather than producing double colons", () => {
    expect(buildKey("a", undefined, "b", null, "", "c")).toBe("a:b:c");
  });

  it("is deterministic for identical input — the property duplicate-event dedup relies on", () => {
    expect(buildKey("transaction-created", "tx_1")).toBe(buildKey("transaction-created", "tx_1"));
  });

  it("produces different keys for different resources", () => {
    expect(buildKey("transaction-created", "tx_1")).not.toBe(buildKey("transaction-created", "tx_2"));
  });
});

describe("dayBucket", () => {
  it("truncates to YYYY-MM-DD, discarding time", () => {
    const morning = new Date("2026-08-05T03:15:00.000Z");
    const evening = new Date("2026-08-05T23:59:59.000Z");
    expect(dayBucket(morning)).toBe("2026-08-05");
    expect(dayBucket(evening)).toBe("2026-08-05");
    expect(dayBucket(morning)).toBe(dayBucket(evening));
  });
});

describe("hourBucket", () => {
  it("truncates to the UTC hour", () => {
    expect(hourBucket(new Date("2026-08-05T14:05:00.000Z"))).toBe("2026-08-05T14");
    expect(hourBucket(new Date("2026-08-05T14:55:00.000Z"))).toBe("2026-08-05T14");
    expect(hourBucket(new Date("2026-08-05T15:00:00.000Z"))).toBe("2026-08-05T15");
  });
});

describe("halfHourBucket", () => {
  it("splits each hour into two 30-minute buckets", () => {
    expect(halfHourBucket(new Date("2026-08-05T14:05:00.000Z"))).toBe("2026-08-05T14:00");
    expect(halfHourBucket(new Date("2026-08-05T14:29:00.000Z"))).toBe("2026-08-05T14:00");
    expect(halfHourBucket(new Date("2026-08-05T14:30:00.000Z"))).toBe("2026-08-05T14:30");
    expect(halfHourBucket(new Date("2026-08-05T14:59:00.000Z"))).toBe("2026-08-05T14:30");
  });
});
