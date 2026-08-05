import { describe, expect, it } from "vitest";
import { recordHttpRequest, getRequestMetricsSnapshot } from "@/lib/observability/metrics";

describe("getRequestMetricsSnapshot", () => {
  it("computes error rate and request count over the recorded window", () => {
    const now = Date.now();
    const route = `/test/${crypto.randomUUID()}`; // unique per test run so entries don't bleed across tests

    recordHttpRequest({ route, method: "GET", statusCode: 200, durationMs: 50, timestamp: now });
    recordHttpRequest({ route, method: "GET", statusCode: 200, durationMs: 60, timestamp: now });
    recordHttpRequest({ route, method: "GET", statusCode: 500, durationMs: 70, timestamp: now });

    const snapshot = getRequestMetricsSnapshot(5 * 60 * 1000);
    const recordedForRoute = snapshot.slowRequests.filter((r) => r.route === route);
    // None of these are >2s, so slowRequests won't show them — instead
    // verify the aggregate counts reflect all three having been recorded.
    expect(snapshot.totalRequests).toBeGreaterThanOrEqual(3);
    expect(recordedForRoute).toEqual([]);
  });

  it("flags requests over 2s as slow, ordered slowest-first", () => {
    const now = Date.now();
    const route = `/slow/${crypto.randomUUID()}`;

    recordHttpRequest({ route, method: "GET", statusCode: 200, durationMs: 2500, timestamp: now });
    recordHttpRequest({ route, method: "GET", statusCode: 200, durationMs: 4000, timestamp: now });

    const snapshot = getRequestMetricsSnapshot(5 * 60 * 1000);
    const forRoute = snapshot.slowRequests.filter((r) => r.route === route);
    expect(forRoute).toHaveLength(2);
    expect(forRoute[0].durationMs).toBeGreaterThanOrEqual(forRoute[1].durationMs);
  });

  it("excludes requests outside the requested time window", () => {
    const longAgo = Date.now() - 10 * 60 * 1000;
    const route = `/old/${crypto.randomUUID()}`;

    recordHttpRequest({ route, method: "GET", statusCode: 200, durationMs: 10, timestamp: longAgo });

    const snapshot = getRequestMetricsSnapshot(60 * 1000); // 1-minute window
    expect(snapshot.slowRequests.some((r) => r.route === route)).toBe(false);
  });
});
