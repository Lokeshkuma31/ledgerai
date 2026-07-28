/**
 * Mock Account Aggregator provider — pure, deterministic fixture data
 * standing in for a real AA network call (e.g. an NBFC-AA under India's
 * Account Aggregator framework). No network, no credentials; every
 * function here is synchronous and side-effect-free except for the
 * in-memory scenario config a connector instance passes in.
 */
import type { AAInstitution, AARawAccount, AARawTransaction, AAScenarioOptions, ProviderHealth } from "@/plugins/account-aggregator/types";
import type { SyncType } from "@/lib/banks/types";

export const PROVIDER_NAME = "Mock Account Aggregator";

export const MOCK_INSTITUTIONS: AAInstitution[] = [
  { id: "fip-hdfc", name: "HDFC Bank", country: "IN", accountTypes: ["savings", "checking"] },
  { id: "fip-icici", name: "ICICI Bank", country: "IN", accountTypes: ["credit-card"] },
  { id: "fip-paytm", name: "Paytm Payments Bank", country: "IN", accountTypes: ["wallet"] },
];

export function listInstitutions(): AAInstitution[] {
  return MOCK_INSTITUTIONS;
}

function accounts(): AARawAccount[] {
  const now = new Date().toISOString();
  return [
    {
      aaAccountId: "aa-savings-01",
      institutionId: "fip-hdfc",
      institutionName: "HDFC Bank",
      accountType: "savings",
      maskedAccountNumber: "XXXX2210",
      currency: "INR",
      currentBalance: 152400,
      availableBalance: 152400,
      linkedAt: now,
    },
    {
      aaAccountId: "aa-checking-01",
      institutionId: "fip-hdfc",
      institutionName: "HDFC Bank",
      accountType: "checking",
      maskedAccountNumber: "XXXX7734",
      currency: "INR",
      currentBalance: 62150.75,
      availableBalance: 62150.75,
      linkedAt: now,
    },
    {
      aaAccountId: "aa-credit-01",
      institutionId: "fip-icici",
      institutionName: "ICICI Bank",
      accountType: "credit-card",
      maskedAccountNumber: "XXXX9081",
      currency: "INR",
      currentBalance: -9450,
      availableBalance: 90550,
      linkedAt: now,
    },
    {
      aaAccountId: "aa-wallet-01",
      institutionId: "fip-paytm",
      institutionName: "Paytm Payments Bank",
      accountType: "wallet",
      maskedAccountNumber: "XXXX0044",
      currency: "INR",
      currentBalance: 980,
      availableBalance: 980,
      linkedAt: now,
    },
  ];
}

/** Consent grants access to every discovered account unless a scenario
 * simulates one having been removed since linking. */
export function discoverAccounts(options: AAScenarioOptions = {}): AARawAccount[] {
  return accounts().filter((a) => a.aaAccountId !== options.removeAccountId);
}

function txn(
  txnId: string,
  aaAccountId: string,
  type: "DEBIT" | "CREDIT",
  amount: number,
  narration: string,
  valueDate: string,
  extra: Partial<AARawTransaction> = {},
): AARawTransaction {
  return { txnId, aaAccountId, type, amount, currency: "INR", narration, valueDate, pending: false, ...extra };
}

const SAVINGS_FULL: AARawTransaction[] = [
  txn("aa-txn-001", "aa-savings-01", "CREDIT", 62000, "Salary", "2026-07-01"),
  txn("aa-txn-002", "aa-savings-01", "DEBIT", 25000, "Rent payment", "2026-07-02"),
  txn("aa-txn-003", "aa-savings-01", "DEBIT", 1450, "Payment at BESCOM", "2026-07-06"),
  txn("aa-txn-004", "aa-savings-01", "CREDIT", 780, "Interest credit", "2026-07-12"),
];
const CHECKING_FULL: AARawTransaction[] = [
  txn("aa-txn-101", "aa-checking-01", "DEBIT", 2650, "Payment at Reliance Fresh", "2026-07-04"),
  txn("aa-txn-102", "aa-checking-01", "DEBIT", 499, "Netflix subscription", "2026-07-09"),
  txn("aa-txn-103", "aa-checking-01", "DEBIT", 899, "Payment at Swiggy", "2026-07-14", { pending: true }),
];
const CREDIT_FULL: AARawTransaction[] = [
  txn("aa-txn-201", "aa-credit-01", "DEBIT", 3299, "Payment at Myntra", "2026-07-05"),
  txn("aa-txn-202", "aa-credit-01", "DEBIT", 1200, "Payment at Dominos", "2026-07-11"),
];
const WALLET_FULL: AARawTransaction[] = [
  txn("aa-txn-301", "aa-wallet-01", "CREDIT", 500, "Wallet top-up", "2026-07-03"),
  txn("aa-txn-302", "aa-wallet-01", "DEBIT", 60, "Payment at Metro Card Recharge", "2026-07-08"),
];

const FULL_BY_ACCOUNT: Record<string, AARawTransaction[]> = {
  "aa-savings-01": SAVINGS_FULL,
  "aa-checking-01": CHECKING_FULL,
  "aa-credit-01": CREDIT_FULL,
  "aa-wallet-01": WALLET_FULL,
};

/** Incremental sync returns the tail of each account's feed, plus
 * aa-txn-103 posting at a corrected amount — the same conflict-detection
 * fixture pattern lib/banks/providers.ts uses for txn-a-006. */
const INCREMENTAL_BY_ACCOUNT: Record<string, AARawTransaction[]> = {
  "aa-savings-01": SAVINGS_FULL.slice(-1),
  "aa-checking-01": [
    txn("aa-txn-103", "aa-checking-01", "DEBIT", 912.5, "Payment at Swiggy", "2026-07-14", { pending: false }),
  ],
  "aa-credit-01": CREDIT_FULL.slice(-1),
  "aa-wallet-01": WALLET_FULL.slice(-1),
};

export function fetchTransactions(aaAccountId: string, syncType: SyncType): AARawTransaction[] {
  const source = syncType === "incremental" ? INCREMENTAL_BY_ACCOUNT : FULL_BY_ACCOUNT;
  return source[aaAccountId] ?? [];
}

export function checkProviderHealth(options: AAScenarioOptions = {}): ProviderHealth {
  const checkedAt = new Date().toISOString();
  if (options.providerOffline) {
    return { status: "offline", message: `${PROVIDER_NAME} is not reachable.`, checkedAt };
  }
  return { status: "online", message: `${PROVIDER_NAME} is reachable.`, checkedAt };
}
