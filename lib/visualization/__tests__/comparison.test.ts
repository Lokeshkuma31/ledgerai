import { describe, expect, it } from "vitest";
import { comparePeriods } from "@/lib/visualization/comparison";

describe("comparePeriods", () => {
  it("reports an upward trend with positive percent change", () => {
    const result = comparePeriods(150, 100);
    expect(result.absoluteChange).toBe(50);
    expect(result.percentChange).toBe(50);
    expect(result.trend).toBe("up");
  });

  it("reports a downward trend with negative percent change", () => {
    const result = comparePeriods(80, 100);
    expect(result.absoluteChange).toBe(-20);
    expect(result.percentChange).toBe(-20);
    expect(result.trend).toBe("down");
  });

  it("reports flat when current equals previous", () => {
    const result = comparePeriods(100, 100);
    expect(result.trend).toBe("flat");
    expect(result.percentChange).toBe(0);
  });

  it("returns a null percentChange when the previous value is 0", () => {
    const result = comparePeriods(100, 0);
    expect(result.percentChange).toBeNull();
    expect(result.trend).toBe("up");
  });
});
