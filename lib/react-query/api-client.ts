/**
 * The one function every React Query hook calls to reach a Route Handler
 * — never `fetch` directly, and never a repository/service import (those
 * are server-only and would break the client bundle, see lib/db/prisma.ts).
 * Normalizes every failure mode (non-2xx response, network failure,
 * timeout) into the AppError hierarchy from lib/api/errors.ts, so a
 * hook's `error` is always `instanceof AppError` with a stable `.code`.
 */
import { AppError, NetworkError, TimeoutError, errorFromResponseBody } from "@/lib/api/errors";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiClientOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  timeoutMs?: number;
}

export async function apiClient<T>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { body, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: { "Content-Type": "application/json", ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TimeoutError();
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw errorFromResponseBody(json?.error ?? { code: "INTERNAL_ERROR", message: response.statusText });
  }
  return json as T;
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
