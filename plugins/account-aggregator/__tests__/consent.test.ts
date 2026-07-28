import { beforeEach, describe, expect, it } from "vitest";
import { denyConsent, expireIfNeeded, getConsent, getConsentHistory, grantConsent, requestConsent, revokeConsent } from "@/plugins/account-aggregator/consent";

describe("Consent lifecycle", () => {
  beforeEach(() => localStorage.clear());

  it("starts Pending on request, with no linked accounts yet", () => {
    requestConsent("Personal finance aggregation", ["transactions", "balances"]);
    const consent = getConsent();
    expect(consent?.status).toBe("Pending");
    expect(consent?.linkedAccounts).toHaveLength(0);
    expect(consent?.expiresAt).toBeNull();
  });

  it("Granted: sets linkedAccounts and a future expiresAt", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    const consent = grantConsent(["acc-1", "acc-2"]);
    expect(consent.status).toBe("Granted");
    expect(consent.linkedAccounts).toEqual(["acc-1", "acc-2"]);
    expect(new Date(consent.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("Denied: records a Denied consent with no linked accounts", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    const consent = denyConsent();
    expect(consent.status).toBe("Denied");
    expect(consent.linkedAccounts).toHaveLength(0);
  });

  it("Expired: expireIfNeeded transitions a past-due Granted consent", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    grantConsent(["acc-1"]);
    const future = new Date(Date.now() + 200 * 86_400_000);
    const consent = expireIfNeeded(future);
    expect(consent?.status).toBe("Expired");
  });

  it("expireIfNeeded is a no-op before expiry", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    grantConsent(["acc-1"]);
    const consent = expireIfNeeded(new Date());
    expect(consent?.status).toBe("Granted");
  });

  it("Revoked: clears linkedAccounts", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    grantConsent(["acc-1"]);
    const consent = revokeConsent();
    expect(consent?.status).toBe("Revoked");
    expect(consent?.linkedAccounts).toHaveLength(0);
  });

  it("records every transition in the timeline", () => {
    requestConsent("Personal finance aggregation", ["transactions"]);
    grantConsent(["acc-1"]);
    revokeConsent();
    const history = getConsentHistory();
    expect(history.map((h) => h.status)).toEqual(["Pending", "Granted", "Revoked"]);
  });
});
