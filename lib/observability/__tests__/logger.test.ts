import { describe, expect, it } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { logger, REDACT_PATHS } from "@/lib/observability/logger";
import { runWithContext } from "@/lib/observability/context";

describe("REDACT_PATHS", () => {
  it("covers every field docs/observability/08-privacy-review.md forbids", () => {
    const required = ["accessToken", "refreshToken", "token", "password", "authorization", "cookie", "description", "amount", "balance"];
    for (const field of required) {
      expect(REDACT_PATHS).toContain(field);
      expect(REDACT_PATHS).toContain(`*.${field}`);
    }
  });

  it("actually redacts a forbidden top-level and one-level-nested field when used with pino's redact option", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const testLogger = pino({ redact: { paths: REDACT_PATHS, censor: "[Redacted]" } }, stream);

    testLogger.info({ accessToken: "super-secret", nested: { password: "hunter2" }, safeField: "keep-me" }, "test event");

    const line = JSON.parse(chunks.join(""));
    expect(line.accessToken).toBe("[Redacted]");
    expect(line.nested.password).toBe("[Redacted]");
    expect(line.safeField).toBe("keep-me");
  });
});

describe("logger()", () => {
  it("returns a usable child logger outside any active context", () => {
    expect(() => logger().info("no context active")).not.toThrow();
  });

  it("returns a usable child logger inside an active observability context", () => {
    runWithContext({ correlationId: "corr_test", userId: "user_test" }, () => {
      expect(() => logger().info("context active")).not.toThrow();
    });
  });
});
