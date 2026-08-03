import { describe, expect, it } from "vitest";
import {
  growthRate,
  highestLowestAverage,
  mean,
  median,
  movingAverage,
  percentile,
  stddev,
  summarizeStatistics,
  variance,
} from "@/lib/visualization/statistics";

describe("mean", () => {
  it("averages a list of numbers", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns 0 for an empty list", () => {
    expect(mean([])).toBe(0);
  });
});

describe("median", () => {
  it("returns the middle value for an odd-length list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("variance / stddev", () => {
  it("computes population variance and its square root", () => {
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 5);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
});

describe("percentile", () => {
  it("interpolates between ranks", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("returns the single value for a one-element list", () => {
    expect(percentile([42], 90)).toBe(42);
  });
});

describe("movingAverage", () => {
  it("averages a trailing window, using fewer points at the start", () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });
});

describe("growthRate", () => {
  it("computes percent change from first to last value", () => {
    expect(growthRate([100, 150])).toBe(50);
  });

  it("returns null for fewer than 2 points", () => {
    expect(growthRate([100])).toBeNull();
  });

  it("returns null when the first value is 0", () => {
    expect(growthRate([0, 100])).toBeNull();
  });
});

describe("highestLowestAverage", () => {
  it("reports highest, lowest, and average", () => {
    expect(highestLowestAverage([3, 1, 2])).toEqual({ highest: 3, lowest: 1, average: 2 });
  });
});

describe("summarizeStatistics", () => {
  it("bundles all stats for a series", () => {
    const summary = summarizeStatistics([1, 2, 3, 4, 5]);
    expect(summary.count).toBe(5);
    expect(summary.mean).toBe(3);
    expect(summary.median).toBe(3);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(5);
    expect(summary.growthRate).toBe(400);
  });

  it("handles an empty series without throwing", () => {
    expect(summarizeStatistics([])).toEqual({
      count: 0,
      mean: 0,
      median: 0,
      variance: 0,
      stddev: 0,
      min: 0,
      max: 0,
      growthRate: null,
    });
  });
});
