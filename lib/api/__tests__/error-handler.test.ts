// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const loggerError = vi.fn();
const captureException = vi.fn();
const recordError = vi.fn();

vi.mock("@/lib/observability/logger", () => ({
  logger: () => ({ error: loggerError }),
}));
vi.mock("@/lib/observability/errors", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));
vi.mock("@/lib/observability/metrics", () => ({
  recordError: (...args: unknown[]) => recordError(...args),
}));

const { handleApiError, handleActionError } = await import("@/lib/api/error-handler");
const { NotFoundError, InternalError } = await import("@/lib/api/errors");

describe("handleApiError", () => {
  it("reports to the logger/Sentry/metrics for a 5xx-class error", async () => {
    loggerError.mockClear();
    captureException.mockClear();
    recordError.mockClear();

    const response = handleApiError(new InternalError("db down"));

    expect(response.status).toBe(500);
    expect(loggerError).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
    expect(recordError).toHaveBeenCalledWith("INTERNAL_ERROR");
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("does NOT report to the logger/Sentry/metrics for a client-error (4xx) AppError", async () => {
    loggerError.mockClear();
    captureException.mockClear();
    recordError.mockClear();

    const response = handleApiError(new NotFoundError("no such connection"));

    expect(response.status).toBe(404);
    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(recordError).not.toHaveBeenCalled();
  });
});

describe("handleActionError", () => {
  it("reports a 5xx-class error and returns the discriminated-union failure shape", () => {
    loggerError.mockClear();
    captureException.mockClear();
    recordError.mockClear();

    const result = handleActionError(new InternalError("boom"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(loggerError).toHaveBeenCalledOnce();
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("does not report a 4xx AppError", () => {
    loggerError.mockClear();
    captureException.mockClear();

    handleActionError(new NotFoundError());

    expect(loggerError).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});
