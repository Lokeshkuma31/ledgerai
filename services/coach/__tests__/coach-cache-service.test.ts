// @vitest-environment node
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { redis } from "@/lib/cache/redis";
import { cacheKeys } from "@/lib/cache/keys";
import { getCachedCoachResponse, setCachedCoachResponse } from "@/services/coach/coach-cache-service";
import type { CoachOutput } from "@/lib/coach/coach";

const organizationId = `coach-cache-test-${crypto.randomUUID()}`;

vi.setConfig({ testTimeout: 20000 });

function makeOutput(overrides: Partial<CoachOutput> = {}): CoachOutput {
  return {
    summary: "You're on track this month.",
    goodHabits: ["Consistent budgeting"],
    watchOutFor: [],
    suggestions: ["Consider increasing your savings rate."],
    ...overrides,
  };
}

afterAll(async () => {
  // Best-effort cleanup across every signature this test might have hashed.
  const signatures = ["sig-a", "sig-b", "sig-c"];
  await Promise.all(
    signatures.map((sig) => {
      const hash = createHash("sha256").update(sig).digest("hex");
      return redis.del(cacheKeys.coachResponse(organizationId, hash));
    }),
  );
});

describe("Coach Cache service (Redis)", () => {
  it("returns null on a cache miss", async () => {
    expect(await getCachedCoachResponse(organizationId, "sig-a")).toBeNull();
  });

  it("round-trips a cached response for the same signature", async () => {
    const output = makeOutput();
    await setCachedCoachResponse(organizationId, "sig-b", output);
    expect(await getCachedCoachResponse(organizationId, "sig-b")).toEqual(output);
  });

  it("treats a changed signature as a miss even though the hash bucket could theoretically differ", async () => {
    await setCachedCoachResponse(organizationId, "sig-c", makeOutput({ summary: "Old summary" }));
    // Different signature entirely — genuinely a different cache entry.
    expect(await getCachedCoachResponse(organizationId, "sig-c-different")).toBeNull();
  });
});
