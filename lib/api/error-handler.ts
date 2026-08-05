/**
 * Server-only mapping from a thrown error to an HTTP response. Kept
 * separate from lib/api/errors.ts (the AppError class hierarchy) so that
 * file stays free of server-only imports (NextResponse, the generated
 * Prisma client) and can be imported from client-side React Query hooks
 * without pulling either into the browser bundle.
 */
import "server-only";
import { NextResponse } from "next/server";
import { Prisma } from "@/src/generated/prisma/client";
import { ZodError } from "zod";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import { logger } from "@/lib/observability/logger";
import { captureException } from "@/lib/observability/errors";
import { recordError } from "@/lib/observability/metrics";

interface NormalizedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/** AppError subclasses pass through as-is; ZodError and Prisma's known-
 * constraint errors (unique violation, record-not-found) are translated;
 * anything else is an opaque 500 (its real message is logged, never sent
 * to the client). */
function normalize(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, code: error.code, message: error.message, details: error.details };
  }
  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Invalid input.",
      details: error.flatten(),
    };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { statusCode: 409, code: "CONFLICT", message: "This already exists." };
    }
    if (error.code === "P2025") {
      return { statusCode: 404, code: "NOT_FOUND", message: "Not found." };
    }
  }
  return { statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
}

/** Every Route Handler's catch block calls this — logs the real error
 * server-side (stack trace, not just the sanitized message), reports it
 * to Sentry, and returns the client-safe shape. This is the single
 * funnel point every Route Handler's 5xx-class error passes through, so
 * it's also the single place Sentry/logger wiring needed to happen — see
 * docs/observability/02-telemetry-strategy.md's "Principle". */
export function handleApiError(error: unknown): NextResponse {
  const normalized = normalize(error);
  if (normalized.statusCode >= 500) {
    logger().error({ err: error, errorCode: normalized.code }, "[api] request failed");
    captureException(error, { errorCode: normalized.code });
    recordError(normalized.code);
  }
  return NextResponse.json(
    { error: { code: normalized.code, message: normalized.message, details: normalized.details } },
    { status: normalized.statusCode },
  );
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

/** Server Actions can't return a non-2xx HTTP status the way a Route
 * Handler can — this is their equivalent boundary, a discriminated union
 * the calling React Query mutation/component switches on. */
export function handleActionError(error: unknown): ActionResult<never> {
  const normalized = normalize(error);
  if (normalized.statusCode >= 500) {
    logger().error({ err: error, errorCode: normalized.code }, "[action] action failed");
    captureException(error, { errorCode: normalized.code });
    recordError(normalized.code);
  }
  return { ok: false, error: { code: normalized.code, message: normalized.message, details: normalized.details } };
}
