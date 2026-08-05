import { describe, expect, it } from "vitest";
import { classifyError, retriesFor, throwClassified, NonRetriableError, RETRY_COUNTS, DEFAULT_RETRIES } from "@/lib/jobs/retry";

describe("classifyError", () => {
  it("classifies network/timeout errors as transient", () => {
    expect(classifyError(Object.assign(new Error("boom"), { code: "ECONNRESET" }))).toBe("transient");
    expect(classifyError(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }))).toBe("transient");
    expect(classifyError(Object.assign(new Error("fetch failed"), {}))).toBe("transient");
  });

  it("classifies rate-limit (429) and 5xx as transient", () => {
    expect(classifyError({ status: 429, message: "rate limited" })).toBe("transient");
    expect(classifyError({ status: 503, message: "unavailable" })).toBe("transient");
  });

  it("classifies auth failures (401/403) and not-found (404) as permanent", () => {
    expect(classifyError({ status: 401, message: "unauthorized" })).toBe("permanent");
    expect(classifyError({ status: 403, message: "forbidden" })).toBe("permanent");
    expect(classifyError({ status: 404, message: "not found" })).toBe("permanent");
  });

  it("classifies validation errors as permanent", () => {
    expect(classifyError({ name: "ZodError", message: "invalid" })).toBe("permanent");
  });

  it("classifies Prisma connection-class error codes as transient", () => {
    expect(classifyError({ code: "P1001", message: "can't reach database" })).toBe("transient");
    expect(classifyError({ code: "P2024", message: "pool timeout" })).toBe("transient");
  });

  it("fails closed: unrecognized errors are classified permanent", () => {
    expect(classifyError(new Error("something bizarre and unclassified"))).toBe("permanent");
    expect(classifyError("a plain string throw")).toBe("permanent");
  });

  it("treats an already-thrown NonRetriableError as permanent", () => {
    expect(classifyError(new NonRetriableError("nope"))).toBe("permanent");
  });
});

describe("throwClassified", () => {
  it("rethrows transient errors unchanged", () => {
    const original = Object.assign(new Error("network blip"), { code: "ECONNRESET" });
    expect(() => throwClassified(original)).toThrowError(original);
  });

  it("wraps permanent errors in NonRetriableError", () => {
    try {
      throwClassified({ status: 401, message: "revoked" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NonRetriableError);
      expect((error as Error).message).toBe("revoked");
    }
  });

  it("passes an existing NonRetriableError through unchanged", () => {
    const original = new NonRetriableError("already permanent");
    expect(() => throwClassified(original)).toThrowError(original);
  });
});

describe("retriesFor", () => {
  it("returns the configured retry count per job type", () => {
    expect(retriesFor("sync-run")).toBe(RETRY_COUNTS["sync-run"]);
    expect(retriesFor("cleanup")).toBe(1);
    expect(retriesFor("feed-generate")).toBe(5);
  });

  it("falls back to the default for an unknown job type", () => {
    expect(retriesFor("some-future-job-type")).toBe(DEFAULT_RETRIES);
  });
});
