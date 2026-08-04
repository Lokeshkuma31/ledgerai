/**
 * The AppError hierarchy — client-safe (no server-only imports), since
 * React Query hooks in the browser need to `instanceof`-check and
 * reconstruct these from a Route Handler's JSON error body. The actual
 * mapping from a thrown error to an HTTP response lives in
 * lib/api/error-handler.ts (server-only: imports NextResponse + Prisma),
 * kept separate specifically so this file never pulls server-only code
 * into a client bundle.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: ErrorCode;
  /** Extra machine-readable detail (e.g. Zod field errors) — merged into
   * the response body's `error.details`, never into `message`. */
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = "VALIDATION_ERROR" as const;
  constructor(message = "That input isn't valid.", details?: unknown) {
    super(message, details);
  }
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED" as const;
  constructor(message = "Sign in required.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN" as const;
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND" as const;
  constructor(message = "Not found.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT" as const;
  constructor(message = "This already exists.", details?: unknown) {
    super(message, details);
  }
}

export class RateLimitedError extends AppError {
  readonly statusCode = 429;
  readonly code = "RATE_LIMITED" as const;
  constructor(message = "Too many requests — try again shortly.") {
    super(message);
  }
}

export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = "INTERNAL_ERROR" as const;
  constructor(message = "Something went wrong. Please try again.") {
    super(message);
  }
}

/** Client-only: `fetch` itself threw (offline, DNS failure, CORS) rather
 * than the server returning a non-2xx response. */
export class NetworkError extends AppError {
  readonly statusCode = 0;
  readonly code = "NETWORK_ERROR" as const;
  constructor(message = "Couldn't reach the server — check your connection.") {
    super(message);
  }
}

/** Client-only: the request was aborted by an AbortController timeout
 * (see lib/react-query/api-client.ts). */
export class TimeoutError extends AppError {
  readonly statusCode = 0;
  readonly code = "TIMEOUT" as const;
  constructor(message = "That took too long — please try again.") {
    super(message);
  }
}

const ERROR_CODE_TO_CLASS: Record<ErrorCode, new (message?: string, details?: unknown) => AppError> = {
  VALIDATION_ERROR: ValidationError,
  UNAUTHORIZED: UnauthorizedError,
  FORBIDDEN: ForbiddenError,
  NOT_FOUND: NotFoundError,
  CONFLICT: ConflictError,
  RATE_LIMITED: RateLimitedError,
  INTERNAL_ERROR: InternalError,
  NETWORK_ERROR: NetworkError,
  TIMEOUT: TimeoutError,
};

/** Reconstructs a typed AppError from a Route Handler's `{ error: {...} }`
 * body — see lib/react-query/api-client.ts, the one place that calls this. */
export function errorFromResponseBody(body: {
  code?: string;
  message?: string;
  details?: unknown;
}): AppError {
  const ErrorClass =
    body.code && body.code in ERROR_CODE_TO_CLASS
      ? ERROR_CODE_TO_CLASS[body.code as ErrorCode]
      : InternalError;
  return new ErrorClass(body.message, body.details);
}
