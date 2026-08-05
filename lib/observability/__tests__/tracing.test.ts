import { describe, expect, it } from "vitest";
import { ROOT_CONTEXT, SpanKind } from "@opentelemetry/api";
import { SamplingDecision } from "@opentelemetry/sdk-trace-base";
import { withSpan, withActionSpan, withJobSpan, LedgerSampler } from "@/lib/observability/tracing";

describe("withSpan", () => {
  it("resolves with the wrapped function's return value", async () => {
    const result = await withSpan("test.span", {}, async () => 42);
    expect(result).toBe(42);
  });

  it("rethrows the original error after recording it on the span", async () => {
    const boom = new Error("boom");
    await expect(withSpan("test.span", {}, async () => { throw boom; })).rejects.toBe(boom);
  });
});

describe("withActionSpan", () => {
  it("resolves with the wrapped action's return value", async () => {
    const result = await withActionSpan("myAction", async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("propagates a thrown error unchanged", async () => {
    await expect(withActionSpan("myAction", async () => { throw new Error("action failed"); })).rejects.toThrow("action failed");
  });
});

describe("withJobSpan", () => {
  it("returns both the handler's result and a traceId string", async () => {
    const { result, traceId } = await withJobSpan("test-job", {}, async () => "job output");
    expect(result).toBe("job output");
    expect(typeof traceId).toBe("string");
    expect(traceId.length).toBeGreaterThan(0);
  });

  it("rethrows on failure so the caller's retry/dead-letter logic still runs", async () => {
    await expect(withJobSpan("test-job", {}, async () => { throw new Error("job failed"); })).rejects.toThrow("job failed");
  });
});

describe("LedgerSampler", () => {
  // A valid-looking (non-all-zero) 32-hex-char trace id — OTel treats the
  // all-zero trace id as invalid, which short-circuits samplers to
  // NOT_RECORD regardless of ratio, so it can't be used as a stand-in
  // "arbitrary" trace id here.
  const args = (name: string) => [ROOT_CONTEXT, "4bf92f3577b34da6a3ce929d0e0e4736", name, SpanKind.INTERNAL, {}, []] as const;

  it("always samples job./oauth./action. spans regardless of the configured ratio", () => {
    const sampler = new LedgerSampler(0);
    expect(sampler.shouldSample(...args("job.sync-run")).decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(sampler.shouldSample(...args("oauth.google.callback")).decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(sampler.shouldSample(...args("action.disconnectConnection")).decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it("defers to the ratio sampler for routine spans — a 0% ratio never records them", () => {
    const sampler = new LedgerSampler(0);
    expect(sampler.shouldSample(...args("prisma.transaction.findMany")).decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it("a 100% ratio always records routine spans too", () => {
    const sampler = new LedgerSampler(1);
    expect(sampler.shouldSample(...args("prisma.transaction.findMany")).decision).not.toBe(SamplingDecision.NOT_RECORD);
  });
});
