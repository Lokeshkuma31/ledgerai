import { describe, expect, it } from "vitest";
import { scrub } from "@/lib/observability/sentry-shared";

describe("scrub", () => {
  it("redacts forbidden keys at the top level", () => {
    const result = scrub({ accessToken: "secret", safe: "keep" }) as Record<string, unknown>;
    expect(result.accessToken).toBe("[Redacted]");
    expect(result.safe).toBe("keep");
  });

  it("redacts forbidden keys nested inside objects and arrays", () => {
    const result = scrub({
      nested: { password: "hunter2", ok: 1 },
      list: [{ refreshToken: "rt-1" }, { fine: true }],
    }) as { nested: Record<string, unknown>; list: Record<string, unknown>[] };

    expect(result.nested.password).toBe("[Redacted]");
    expect(result.nested.ok).toBe(1);
    expect(result.list[0].refreshToken).toBe("[Redacted]");
    expect(result.list[1].fine).toBe(true);
  });

  it("is case-insensitive on the key name", () => {
    const result = scrub({ AccessToken: "secret", COOKIE: "abc" }) as Record<string, unknown>;
    expect(result.AccessToken).toBe("[Redacted]");
    expect(result.COOKIE).toBe("[Redacted]");
  });

  it("leaves primitives and null/undefined untouched", () => {
    expect(scrub("plain string")).toBe("plain string");
    expect(scrub(42)).toBe(42);
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it("does not infinitely recurse on deeply nested objects", () => {
    let deep: Record<string, unknown> = { password: "leaf" };
    for (let i = 0; i < 20; i += 1) deep = { child: deep };
    expect(() => scrub(deep)).not.toThrow();
  });
});
