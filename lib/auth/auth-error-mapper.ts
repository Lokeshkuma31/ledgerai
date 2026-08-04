/**
 * Better Auth's client returns `{ data, error }` rather than throwing
 * (see lib/auth/auth-client.ts) — shared by every auth hook that needs to
 * translate its error shape into the same AppError hierarchy every other
 * hook's `error` carries (lib/api/errors.ts), so a component can handle a
 * login failure and a failed transaction fetch identically.
 */
import { ForbiddenError, InternalError, UnauthorizedError, ValidationError, type AppError } from "@/lib/api/errors";

export function toAppError(error: { status?: number; message?: string } | null | undefined): AppError {
  const message = error?.message ?? "Something went wrong.";
  switch (error?.status) {
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 422:
    case 400:
      return new ValidationError(message);
    default:
      return new InternalError(message);
  }
}
