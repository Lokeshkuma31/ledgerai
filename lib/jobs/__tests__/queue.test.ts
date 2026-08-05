import { describe, expect, it } from "vitest";
import { orgConcurrency, globalConcurrency, mutex, tieredConcurrency, hardRateLimit, throttle, INTERACTIVE_PRIORITY } from "@/lib/jobs/queue";

describe("concurrency builders", () => {
  it("orgConcurrency scopes by organizationId", () => {
    expect(orgConcurrency(5)).toEqual({ limit: 5, key: "event.data.organizationId" });
  });

  it("globalConcurrency has no key (unscoped cap)", () => {
    expect(globalConcurrency(25)).toEqual({ limit: 25 });
  });

  it("mutex is always limit 1, scoped to the given key expression", () => {
    expect(mutex("event.data.providerId")).toEqual({ limit: 1, key: "event.data.providerId" });
  });

  it("tieredConcurrency combines an org limit and a global cap", () => {
    expect(tieredConcurrency(5, 40)).toEqual([
      { limit: 5, key: "event.data.organizationId" },
      { limit: 40 },
    ]);
  });
});

describe("rate limiting builders", () => {
  it("hardRateLimit carries limit/period/key through", () => {
    expect(hardRateLimit(1, "1h", "event.data.connectionId")).toEqual({
      limit: 1,
      period: "1h",
      key: "event.data.connectionId",
    });
  });

  it("throttle additionally carries an optional burst", () => {
    expect(throttle(50, "1m", "event.data.providerId", 10)).toEqual({
      limit: 50,
      period: "1m",
      key: "event.data.providerId",
      burst: 10,
    });
  });
});

describe("INTERACTIVE_PRIORITY", () => {
  it("is a CEL expression keyed on data.priority", () => {
    expect(INTERACTIVE_PRIORITY.run).toContain("priority");
    expect(INTERACTIVE_PRIORITY.run).toContain("interactive");
  });
});
