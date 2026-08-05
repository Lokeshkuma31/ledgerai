import { describe, expect, it } from "vitest";
import {
  getObservabilityContext,
  getOrCreateCorrelationId,
  mintCorrelationId,
  mintRequestId,
  runWithContext,
  runWithContextAsync,
  updateObservabilityContext,
} from "@/lib/observability/context";

describe("mintCorrelationId / mintRequestId", () => {
  it("produces distinct, prefixed ids", () => {
    const a = mintCorrelationId();
    const b = mintCorrelationId();
    expect(a).toMatch(/^corr_/);
    expect(a).not.toBe(b);
    expect(mintRequestId()).toMatch(/^req_/);
  });
});

describe("getOrCreateCorrelationId", () => {
  it("prefers an explicit inbound id over minting one", () => {
    expect(getOrCreateCorrelationId("corr_inbound")).toBe("corr_inbound");
  });

  it("mints a fresh id outside any active context when no inbound id is given", () => {
    expect(getOrCreateCorrelationId(undefined)).toMatch(/^corr_/);
  });

  it("falls back to the active context's correlationId when set", () => {
    runWithContext({ correlationId: "corr_active" }, () => {
      expect(getOrCreateCorrelationId(null)).toBe("corr_active");
    });
  });
});

describe("runWithContext / getObservabilityContext", () => {
  it("returns undefined outside any active context", () => {
    expect(getObservabilityContext()).toBeUndefined();
  });

  it("exposes the fields passed to runWithContext for the duration of the callback", () => {
    runWithContext({ correlationId: "corr_1", userId: "user_1" }, () => {
      const ctx = getObservabilityContext();
      expect(ctx?.correlationId).toBe("corr_1");
      expect(ctx?.userId).toBe("user_1");
    });
    expect(getObservabilityContext()).toBeUndefined();
  });

  it("merges a nested context over its parent rather than replacing it", () => {
    runWithContext({ correlationId: "corr_outer", userId: "user_outer" }, () => {
      runWithContext({ jobId: "job_inner" }, () => {
        const ctx = getObservabilityContext();
        // correlationId/userId inherited from the outer context...
        expect(ctx?.correlationId).toBe("corr_outer");
        expect(ctx?.userId).toBe("user_outer");
        // ...jobId added by the inner context.
        expect(ctx?.jobId).toBe("job_inner");
      });
    });
  });

  it("lets an inner context override a field the outer context also set", () => {
    runWithContext({ correlationId: "corr_outer" }, () => {
      runWithContext({ correlationId: "corr_inner" }, () => {
        expect(getObservabilityContext()?.correlationId).toBe("corr_inner");
      });
      // Back in the outer context after the inner call returns.
      expect(getObservabilityContext()?.correlationId).toBe("corr_outer");
    });
  });

  it("does not leak context between two concurrently-running async contexts", async () => {
    const results: string[] = [];

    async function slowerFirst() {
      return runWithContextAsync({ correlationId: "corr_A" }, async () => {
        await new Promise((r) => setTimeout(r, 20));
        results.push(getObservabilityContext()?.correlationId ?? "MISSING");
      });
    }
    async function fasterSecond() {
      return runWithContextAsync({ correlationId: "corr_B" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(getObservabilityContext()?.correlationId ?? "MISSING");
      });
    }

    await Promise.all([slowerFirst(), fasterSecond()]);
    // Order is B-then-A (B resolves first), but each must see its OWN
    // correlationId regardless of interleaving — this is the property
    // AsyncLocalStorage exists to guarantee under Fluid Compute's warm-
    // instance reuse across concurrent requests.
    expect(results.sort()).toEqual(["corr_A", "corr_B"]);
  });
});

describe("updateObservabilityContext", () => {
  it("mutates the active context in place, visible to subsequent reads in the same run", () => {
    runWithContext({ correlationId: "corr_1" }, () => {
      updateObservabilityContext({ traceId: "trace_1" });
      expect(getObservabilityContext()?.traceId).toBe("trace_1");
      expect(getObservabilityContext()?.correlationId).toBe("corr_1");
    });
  });

  it("no-ops outside any active context instead of throwing", () => {
    expect(() => updateObservabilityContext({ traceId: "trace_x" })).not.toThrow();
  });
});
