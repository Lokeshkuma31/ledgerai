import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signIn: { email: vi.fn() } },
}));

const { authClient } = await import("@/lib/auth/auth-client");
const { useLogin } = await import("@/hooks/auth/use-login");
const { UnauthorizedError, ValidationError } = await import("@/lib/api/errors");
const { queryKeys } = await import("@/lib/react-query/keys");

function createWrapperWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

beforeEach(() => {
  vi.mocked(authClient.signIn.email).mockReset();
});

describe("useLogin", () => {
  it("invalidates the currentUser query on success", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(authClient.signIn.email).mockResolvedValue({ data: { redirect: false }, error: null } as any);
    const { wrapper, queryClient } = createWrapperWithClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: "person@example.com", password: "hunter2ok" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.auth.currentUser() });
  });

  it("maps a 401 from Better Auth to UnauthorizedError", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { status: 401, message: "Invalid email or password." },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: "person@example.com", password: "wrong" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(UnauthorizedError);
    expect(result.current.error?.message).toBe("Invalid email or password.");
  });

  it("maps a 422 from Better Auth to ValidationError", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: null,
      error: { status: 422, message: "Password is too short." },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const { wrapper } = createWrapperWithClient();

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: "person@example.com", password: "x" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ValidationError);
  });
});
