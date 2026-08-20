import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/hooks/auth/use-current-user";
import { UnauthorizedError } from "@/lib/api/errors";
import type { CurrentUserResponse } from "@/app/api/me/route";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCurrentUser", () => {
  it("returns the current user, organization, and role on success", async () => {
    const body: CurrentUserResponse = {
      user: { id: "u1", email: "person@example.com", name: "Person", image: null },
      organizationId: "org1",
      organizationName: "Person's Workspace",
      role: "OWNER",
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/api/me", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("surfaces UnauthorizedError as a typed error, not a generic failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, 401),
    );

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(UnauthorizedError);
    expect(result.current.error?.message).toBe("Sign in required.");
  });

  it("does not retry a 401 (retry: false — a 401 won't become a 200)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, 401),
    );

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
