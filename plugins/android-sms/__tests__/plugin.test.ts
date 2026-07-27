import { describe, expect, it } from "vitest";
import { androidSmsPlugin, buildPreviewRows, DEFAULT_SETTINGS } from "@/plugins/android-sms/plugin";
import type { RawSmsMessage } from "@/plugins/android-sms/types";

function message(id: string, body: string, receivedAt = "2026-07-20T10:00:00Z"): RawSmsMessage {
  return { id, sender: "TESTBK", channel: "sms", sourceType: "bank-sms", body, receivedAt };
}

describe("buildPreviewRows", () => {
  it("marks a clean, parseable message Ready", () => {
    const rows = buildPreviewRows([message("m1", "₹450.00 paid to Swiggy using UPI.")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Ready");
    expect(rows[0].normalized?.merchant).toBe("Swiggy");
  });

  it("marks a non-transaction message Malformed", () => {
    const rows = buildPreviewRows([message("m1", "123456 is your OTP for login.")]);
    expect(rows[0].status).toBe("Malformed");
  });

  it("marks a financial-looking but unsupported message Unknown Format", () => {
    const rows = buildPreviewRows([message("m1", "You bought 0.001 BTC for $45.00 on CoinDCX.")]);
    expect(rows[0].status).toBe("Unknown Format");
  });

  it("never imports a failed transaction — always Skipped, even though it parsed", () => {
    const rows = buildPreviewRows([message("m1", "Your transaction of Rs.500.00 to Swiggy has failed.")]);
    expect(rows[0].normalized?.transactionType).toBe("failed");
    expect(rows[0].status).toBe("Skipped");
  });

  it("flags the second of two identical messages as a Duplicate", () => {
    const body = "₹250.00 paid to Zomato using UPI. UPI Ref No 778899001122.";
    const rows = buildPreviewRows([
      message("m1", body, "2026-07-20T10:00:00Z"),
      message("m2", body, "2026-07-20T10:01:00Z"),
    ]);
    expect(rows[0].status).toBe("Ready");
    expect(rows[1].status).toBe("Duplicate");
  });

  it("skips unknown-merchant rows when configured to", () => {
    const rows = buildPreviewRows(
      [message("m1", "Rs.1,250.00 debited from A/c XX2211 on 08-07-2026.")],
      { ...DEFAULT_SETTINGS, unknownMerchantHandling: "skip" },
    );
    expect(rows[0].status).toBe("Skipped");
  });
});

describe("androidSmsPlugin (Plugin Framework registration)", () => {
  it("declares itself as a transaction-source/feed-generator/search-provider plugin", () => {
    expect(androidSmsPlugin.id).toBe("android-sms");
    expect(androidSmsPlugin.capabilities()).toEqual(
      expect.arrayContaining(["transaction-source", "feed-generator", "search-provider"]),
    );
  });

  it("register()/unregister() run without throwing and are idempotent to call in sequence", async () => {
    await expect(Promise.resolve(androidSmsPlugin.register())).resolves.toBeUndefined();
    await expect(Promise.resolve(androidSmsPlugin.unregister())).resolves.toBeUndefined();
  });

  it("reports a PluginHealth shape from health()", async () => {
    const health = await androidSmsPlugin.health();
    expect(["healthy", "warning", "error", "disabled", "unavailable"]).toContain(health.status);
    expect(typeof health.message).toBe("string");
  });
});
