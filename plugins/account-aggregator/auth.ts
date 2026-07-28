/**
 * Mock Authentication Flow — composes consent.ts and mock-provider.ts into
 * the Consent Flow the spec describes: Request Consent -> Pending ->
 * Granted -> Account Discovery. No real credential exchange or redirect
 * ever happens; "approval" is simulated synchronously so the existing
 * BankConnector.authenticate() contract (single async call) still applies
 * unchanged for a future real AA/OAuth provider.
 */
import { checkProviderHealth, discoverAccounts, PROVIDER_NAME } from "@/plugins/account-aggregator/mock-provider";
import { denyConsent, expireIfNeeded, getConsent, grantConsent, requestConsent, revokeConsent } from "@/plugins/account-aggregator/consent";
import type { AARawAccount, AAScenarioOptions, Consent } from "@/plugins/account-aggregator/types";

export class ConsentDeniedError extends Error {
  constructor() {
    super(`${PROVIDER_NAME}: consent was denied.`);
  }
}

export class ProviderOfflineError extends Error {
  constructor() {
    super(`${PROVIDER_NAME} is currently offline.`);
  }
}

export interface ConnectResult {
  consent: Consent;
  accounts: AARawAccount[];
}

/** The full mock consent + discovery flow a connector's authenticate()
 * drives. Throws ConsentDeniedError/ProviderOfflineError for the
 * corresponding test scenarios rather than returning a half-connected
 * state — the caller (connector.ts) is responsible for reflecting that as
 * a failed authenticate(). */
export async function connect(options: AAScenarioOptions = {}): Promise<ConnectResult> {
  const health = checkProviderHealth(options);
  if (health.status === "offline") throw new ProviderOfflineError();

  requestConsent("Personal finance aggregation", ["transactions", "balances", "account-metadata"]);

  if (options.denyConsent) {
    denyConsent();
    throw new ConsentDeniedError();
  }

  const accounts = discoverAccounts(options);
  const consent = grantConsent(accounts.map((a) => a.aaAccountId));

  if (options.expireConsentImmediately) {
    return { consent: { ...consent, status: "Expired", expiresAt: new Date(0).toISOString() }, accounts };
  }
  return { consent, accounts };
}

/** Re-validates the current consent's expiry — the mock equivalent of
 * refreshing a near-expired access token. A no-op if there's nothing to
 * refresh or the consent is already invalid; the caller decides what that
 * means for connection state. */
export function refreshSession(now: Date = new Date()): Consent | null {
  return expireIfNeeded(now);
}

export function disconnectSession(): Consent | null {
  return revokeConsent();
}

export function currentConsent(): Consent | null {
  return getConsent();
}
