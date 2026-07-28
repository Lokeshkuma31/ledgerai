/**
 * Account Aggregator plugin — local types. AA-specific shapes only; the
 * framework-shared BankAccount/RawBankTransaction (lib/banks/types.ts) is
 * what mapper.ts translates these into before anything crosses into
 * lib/banks/.
 */
import type { BankAccountType } from "@/lib/banks/types";

export const CONSENT_STATUSES = ["Pending", "Granted", "Denied", "Expired", "Revoked"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_PERMISSIONS = ["transactions", "balances", "account-metadata"] as const;
export type ConsentPermission = (typeof CONSENT_PERMISSIONS)[number];

/** The consent artifact — independent of any specific connector instance;
 * one consent covers every account the AA discovers under it. */
export interface Consent {
  id: string;
  provider: string;
  status: ConsentStatus;
  purpose: string;
  createdAt: string; // ISO 8601
  expiresAt: string | null; // ISO 8601 — null only while Pending
  lastUpdated: string; // ISO 8601
  linkedAccounts: string[]; // AA account ids
  permissions: ConsentPermission[];
}

export interface ConsentTimelineEntry {
  status: ConsentStatus;
  at: string; // ISO 8601
  note: string;
}

export interface AAInstitution {
  id: string;
  name: string;
  country: string;
  accountTypes: BankAccountType[];
}

/** AA-native account shape, as the provider's own API would return it —
 * never seen outside mock-provider.ts/mapper.ts. */
export interface AARawAccount {
  aaAccountId: string;
  institutionId: string;
  institutionName: string;
  accountType: BankAccountType;
  maskedAccountNumber: string;
  currency: string;
  currentBalance: number;
  availableBalance: number;
  linkedAt: string; // ISO 8601
}

/** AA-native transaction shape. */
export interface AARawTransaction {
  txnId: string;
  aaAccountId: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
  narration: string;
  valueDate: string; // "YYYY-MM-DD"
  pending: boolean;
}

export const PROVIDER_STATUSES = ["online", "degraded", "offline"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export interface ProviderHealth {
  status: ProviderStatus;
  message: string;
  checkedAt: string; // ISO 8601
}

/** Test-scenario toggles — the only way this milestone's mock provider
 * deviates from its default happy path (Consent Granted, provider online,
 * full account set). Mirrors lib/banks/providers.ts's DemoBankB
 * failAuthenticate/failSync constructor options. */
export interface AAScenarioOptions {
  denyConsent?: boolean;
  expireConsentImmediately?: boolean;
  providerOffline?: boolean;
  failSync?: boolean;
  removeAccountId?: string;
}
