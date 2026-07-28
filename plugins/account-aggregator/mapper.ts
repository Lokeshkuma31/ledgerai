/**
 * Transaction Mapping — translates this provider's own AARawAccount/
 * AARawTransaction shapes into the Bank Connector Framework's
 * bank-agnostic BankAccount/RawBankTransaction (lib/banks/types.ts).
 * Nothing past this file ever sees an AA-native field name; from here on,
 * lib/banks/mapper.ts's toIngestInput/computeTransactionFingerprint (used
 * generically by every connector) take over unchanged.
 */
import type { BankAccount, RawBankTransaction } from "@/lib/banks/types";
import type { AARawAccount, AARawTransaction } from "@/plugins/account-aggregator/types";

/** The framework's BankAccount.id is the identity sync-engine.ts keys its
 * per-connector account list and transaction links on — prefixed so it can
 * never collide with another connector's own account ids. */
export function toBankAccountId(aaAccountId: string): string {
  return `account-aggregator:${aaAccountId}`;
}

export function toBankAccount(raw: AARawAccount): BankAccount {
  return {
    id: toBankAccountId(raw.aaAccountId),
    institution: raw.institutionName,
    accountName: `${raw.institutionName} ${raw.accountType.replace("-", " ")}`,
    accountType: raw.accountType,
    maskedNumber: raw.maskedAccountNumber,
    currency: raw.currency,
    balance: raw.currentBalance,
    availableBalance: raw.availableBalance,
    lastSynced: new Date().toISOString(),
    status: "active",
    metadata: { aaAccountId: raw.aaAccountId, institutionId: raw.institutionId, linkedAt: raw.linkedAt },
  };
}

export function toRawBankTransaction(raw: AARawTransaction): RawBankTransaction {
  return {
    externalId: raw.txnId,
    accountId: toBankAccountId(raw.aaAccountId),
    amount: raw.amount,
    direction: raw.type === "CREDIT" ? "credit" : "debit",
    currency: raw.currency,
    description: raw.narration,
    postedAt: raw.valueDate,
    pending: raw.pending,
  };
}
