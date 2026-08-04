// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: vi.fn(),
  getCurrentMembership: vi.fn(),
}));

const { getCurrentMembership, getCurrentSession } = await import("@/lib/auth/session");
const { GET } = await import("@/app/api/me/route");

beforeEach(() => {
  vi.mocked(getCurrentSession).mockReset();
  vi.mocked(getCurrentMembership).mockReset();
});

describe("GET /api/me", () => {
  it("returns 401 when there is no session", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the session exists but has no membership", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(getCurrentMembership).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toMatch(/workspace/i);
  });

  it("returns user + organization + role on success", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "u1", email: "person@example.com", name: "Person", image: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(getCurrentMembership).mockResolvedValue({
      organizationId: "org1",
      organizationName: "Person's Workspace",
      role: "OWNER",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      user: { id: "u1", email: "person@example.com", name: "Person", image: null },
      organizationId: "org1",
      organizationName: "Person's Workspace",
      role: "OWNER",
    });
  });
});
