// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The only thing mocked: the Inngest client's own network call — matches
// this repo's "mock only true external I/O" convention (see
// lib/auth/__tests__/session.test.ts). Everything else (zod validation,
// correlationId/id handling) runs for real.
const sendMock = vi.fn(async (..._args: unknown[]) => ({ ids: ["evt_mock_1"] }));
vi.mock("@/lib/jobs/engine", () => ({
  inngest: { send: (payload: unknown) => sendMock(payload) },
  JOB_PLATFORM_APP_ID: "ledgerai",
}));

const { dispatch } = await import("@/lib/jobs/dispatcher");

beforeEach(() => {
  sendMock.mockClear();
});

describe("dispatch", () => {
  it("sends a validated event through the Inngest client", async () => {
    await dispatch("ledger/transaction.created", { organizationId: "org_1", transactionId: "tx_1" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe("ledger/transaction.created");
    expect(sent.data).toMatchObject({ organizationId: "org_1", transactionId: "tx_1" });
  });

  it("generates a fresh correlationId when none is provided", async () => {
    await dispatch("ledger/transaction.created", { organizationId: "org_1", transactionId: "tx_1" });
    const sent = sendMock.mock.calls[0][0] as { data: { correlationId: string } };
    expect(typeof sent.data.correlationId).toBe("string");
    expect(sent.data.correlationId.length).toBeGreaterThan(0);
  });

  it("threads an explicit correlationId through unchanged (chained dispatch)", async () => {
    await dispatch("ledger/transaction.created", {
      organizationId: "org_1",
      transactionId: "tx_1",
      correlationId: "corr_from_parent_chain",
    });
    const sent = sendMock.mock.calls[0][0] as { data: { correlationId: string } };
    expect(sent.data.correlationId).toBe("corr_from_parent_chain");
  });

  it("passes an explicit dedup id through to the Inngest client", async () => {
    await dispatch(
      "ledger/transaction.created",
      { organizationId: "org_1", transactionId: "tx_1" },
      { id: "transaction-created:tx_1" },
    );
    const sent = sendMock.mock.calls[0][0] as { id?: string };
    expect(sent.id).toBe("transaction-created:tx_1");
  });

  it("rejects a payload that fails the event's zod schema before ever calling send()", async () => {
    await expect(
      // @ts-expect-error deliberately missing the required transactionId field
      dispatch("ledger/transaction.created", { organizationId: "org_1" }),
    ).rejects.toThrow();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
