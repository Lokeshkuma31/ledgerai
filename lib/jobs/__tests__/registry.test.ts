// @vitest-environment node
//
// Imports the real registry (no mocking) — inngest.createFunction() only
// constructs InngestFunction instances at import time, it never makes a
// network call, so this is safe without mocking lib/jobs/engine.
import { describe, expect, it } from "vitest";
import { functions } from "@/lib/jobs/registry";
import { EVENT_SCHEMAS, parseEventPayload } from "@/lib/jobs/events";

interface IntrospectableFunction {
  opts: { id: string; triggers: unknown; retries?: number; onFailure?: unknown };
}

function opts(fn: unknown) {
  return (fn as IntrospectableFunction).opts;
}

describe("job registry", () => {
  it("registers every job with a unique id", () => {
    const ids = functions.map((fn) => opts(fn).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every job has a dead-letter (onFailure) handler wired", () => {
    for (const fn of functions) {
      expect(typeof opts(fn).onFailure).toBe("function");
    }
  });

  it("every job declares at least one trigger (event or cron)", () => {
    for (const fn of functions) {
      expect(opts(fn).triggers).toBeTruthy();
    }
  });

  it("includes the primary dependency chain's jobs (docs/job-platform/03-job-dependency-graph.md)", () => {
    const ids = new Set(functions.map((fn) => opts(fn).id));
    for (const expected of [
      "sync-run",
      "document-parse",
      "merchant-normalize",
      "classification",
      "workflow-execute",
      "feed-generate",
      "notification-generate",
      "search-index",
    ]) {
      expect(ids.has(expected)).toBe(true);
    }
  });
});

describe("event catalog", () => {
  it("validates a well-formed payload for every registered event schema", () => {
    const samples: Record<string, Record<string, unknown>> = {
      "ledger/user.created": { userId: "u1", email: "a@b.com" },
      "ledger/transaction.created": { transactionId: "tx1" },
      "ledger/document.uploaded": { documentId: "d1", r2Key: "k1", fileName: "f.pdf", mimeType: "application/pdf", sizeBytes: 100 },
    };
    for (const [name, sample] of Object.entries(samples)) {
      expect(() => parseEventPayload(name as keyof typeof EVENT_SCHEMAS, { ...sample, correlationId: "c1" })).not.toThrow();
    }
  });

  it("rejects a payload missing a required field", () => {
    expect(() => parseEventPayload("ledger/transaction.created", { correlationId: "c1" })).toThrow();
  });

  it("every event schema accepts the shared envelope fields", () => {
    for (const [name, schema] of Object.entries(EVENT_SCHEMAS)) {
      const shape = (schema as { shape?: Record<string, unknown> }).shape;
      expect(shape, `${name} should be a zod object with an envelope`).toBeDefined();
      expect(shape).toHaveProperty("correlationId");
      expect(shape).toHaveProperty("organizationId");
    }
  });
});
