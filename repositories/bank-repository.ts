/**
 * Bank Repository — Postgres-backed persistence for
 * lib/banks/registry.ts's persisted half (PersistedConnectorState +
 * AccountsMap). The live connector instances (lib/banks/connector.ts
 * objects — not serializable) stay exactly where they are, in
 * lib/banks/registry.ts's in-memory `instances` Map, re-registered every
 * cold start by lib/banks/providers.ts — this repository only owns what
 * that module used to write to `ledgerai:banks:state`/`ledgerai:banks:accounts`.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type {
  AccountStatus,
  BankAccount,
  BankAccountType as AppBankAccountType,
  ConnectionStatus,
  ConnectorHealth,
} from "@/lib/banks/types";
import type {
  BankAccount as PrismaBankAccount,
  BankAccountStatus as PrismaBankAccountStatus,
  BankAccountType as PrismaBankAccountType,
  BankConnectionStatus as PrismaBankConnectionStatus,
  BankConnectorState as PrismaBankConnectorState,
} from "@/src/generated/prisma/client";

const ACCOUNT_TYPE_TO_DB: Record<AppBankAccountType, PrismaBankAccountType> = {
  checking: "CHECKING",
  savings: "SAVINGS",
  "credit-card": "CREDIT_CARD",
  loan: "LOAN",
  investment: "INVESTMENT",
  wallet: "WALLET",
  business: "BUSINESS",
  cash: "CASH",
};
const ACCOUNT_TYPE_FROM_DB: Record<PrismaBankAccountType, AppBankAccountType> = {
  CHECKING: "checking",
  SAVINGS: "savings",
  CREDIT_CARD: "credit-card",
  LOAN: "loan",
  INVESTMENT: "investment",
  WALLET: "wallet",
  BUSINESS: "business",
  CASH: "cash",
};

const ACCOUNT_STATUS_TO_DB: Record<AccountStatus, PrismaBankAccountStatus> = {
  active: "ACTIVE",
  inactive: "INACTIVE",
  closed: "CLOSED",
  error: "ERROR",
};
const ACCOUNT_STATUS_FROM_DB: Record<PrismaBankAccountStatus, AccountStatus> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  CLOSED: "closed",
  ERROR: "error",
};

const CONNECTION_STATUS_TO_DB: Record<ConnectionStatus, PrismaBankConnectionStatus> = {
  connected: "CONNECTED",
  disconnected: "DISCONNECTED",
  authenticating: "AUTHENTICATING",
  "reauthentication-required": "REAUTHENTICATION_REQUIRED",
  error: "ERROR",
};
const CONNECTION_STATUS_FROM_DB: Record<PrismaBankConnectionStatus, ConnectionStatus> = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  AUTHENTICATING: "authenticating",
  REAUTHENTICATION_REQUIRED: "reauthentication-required",
  ERROR: "error",
};

export interface PersistedConnectorState {
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  lastHealth?: ConnectorHealth;
  lastConnection?: ConnectionStatus;
  lastSync?: string | null;
}

function toState(row: PrismaBankConnectorState): PersistedConnectorState {
  return {
    enabled: row.enabled,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastHealth: (row.lastHealth as unknown as ConnectorHealth | null) ?? undefined,
    lastConnection: row.lastConnection ? CONNECTION_STATUS_FROM_DB[row.lastConnection] : undefined,
    lastSync: row.lastSyncAt?.toISOString() ?? null,
  };
}

function toAccount(row: PrismaBankAccount): BankAccount {
  return {
    id: row.id,
    institution: row.institution,
    accountName: row.accountName,
    accountType: ACCOUNT_TYPE_FROM_DB[row.accountType],
    maskedNumber: row.maskedNumber,
    currency: row.currency,
    balance: row.balance.toNumber(),
    availableBalance: row.availableBalance.toNumber(),
    lastSynced: row.lastSynced?.toISOString() ?? null,
    status: ACCOUNT_STATUS_FROM_DB[row.status],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function getState(
  organizationId: string,
  connectorId: string,
): Promise<PersistedConnectorState | undefined> {
  const row = await prisma.bankConnectorState.findUnique({
    where: { organizationId_connectorId: { organizationId, connectorId } },
  });
  return row ? toState(row) : undefined;
}

export async function getAllStates(
  organizationId: string,
): Promise<Record<string, PersistedConnectorState>> {
  const rows = await prisma.bankConnectorState.findMany({ where: { organizationId } });
  return Object.fromEntries(rows.map((row) => [row.connectorId, toState(row)]));
}

/** Seeds default state (enabled, fresh installedAt/updatedAt) on first
 * registration only — mirrors lib/banks/registry.ts::registerConnector's
 * `if (!state[connector.id])` guard exactly, via an upsert that no-ops the
 * update branch. */
export async function ensureConnectorRegistered(
  organizationId: string,
  connectorId: string,
): Promise<void> {
  await prisma.bankConnectorState.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    create: { organizationId, connectorId, enabled: true },
    update: {},
  });
}

export async function setConnectorEnabled(
  organizationId: string,
  connectorId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.bankConnectorState.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    create: { organizationId, connectorId, enabled },
    update: { enabled },
  });
}

export async function recordConnectorHealth(
  organizationId: string,
  connectorId: string,
  health: ConnectorHealth,
): Promise<void> {
  await prisma.bankConnectorState.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    create: { organizationId, connectorId, lastHealth: health as unknown as Prisma.InputJsonValue },
    update: { lastHealth: health as unknown as Prisma.InputJsonValue },
  });
}

export async function recordConnectorConnection(
  organizationId: string,
  connectorId: string,
  connection: ConnectionStatus,
): Promise<void> {
  const dbValue = CONNECTION_STATUS_TO_DB[connection];
  await prisma.bankConnectorState.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    create: { organizationId, connectorId, lastConnection: dbValue },
    update: { lastConnection: dbValue },
  });
}

export async function recordConnectorLastSync(
  organizationId: string,
  connectorId: string,
  lastSyncIso: string,
): Promise<void> {
  await prisma.bankConnectorState.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId } },
    create: { organizationId, connectorId, lastSyncAt: new Date(lastSyncIso) },
    update: { lastSyncAt: new Date(lastSyncIso) },
  });
}

/** Replaces this connector's stored accounts wholesale with its latest
 * sync result, mirroring lib/banks/registry.ts::upsertAccounts exactly —
 * a connector's own sync() is always the full authoritative account list
 * it currently knows about, so delete-then-insert (not a merge) is
 * correct, same as the old "replace the array" localStorage write. */
export async function upsertAccounts(
  organizationId: string,
  connectorId: string,
  accounts: BankAccount[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.bankAccount.deleteMany({ where: { organizationId, connectorId } });
    if (accounts.length === 0) return;
    await tx.bankAccount.createMany({
      data: accounts.map((account) => ({
        id: account.id,
        organizationId,
        connectorId,
        institution: account.institution,
        accountName: account.accountName,
        accountType: ACCOUNT_TYPE_TO_DB[account.accountType],
        maskedNumber: account.maskedNumber,
        currency: account.currency,
        balance: account.balance.toFixed(2),
        availableBalance: account.availableBalance.toFixed(2),
        lastSynced: account.lastSynced ? new Date(account.lastSynced) : null,
        status: ACCOUNT_STATUS_TO_DB[account.status],
        metadata: account.metadata as Prisma.InputJsonValue,
      })),
    });
  });
}

export async function getAccountsForConnector(
  organizationId: string,
  connectorId: string,
): Promise<BankAccount[]> {
  const rows = await prisma.bankAccount.findMany({ where: { organizationId, connectorId } });
  return rows.map(toAccount);
}

export async function getAllAccounts(organizationId: string): Promise<BankAccount[]> {
  const rows = await prisma.bankAccount.findMany({ where: { organizationId } });
  return rows.map(toAccount);
}

/** Marks every account of a connector "error" without discarding its last
 * known balances — mirrors lib/banks/registry.ts::markAccountsStatus. */
export async function markAccountsStatus(
  organizationId: string,
  connectorId: string,
  status: AccountStatus,
): Promise<void> {
  await prisma.bankAccount.updateMany({
    where: { organizationId, connectorId },
    data: { status: ACCOUNT_STATUS_TO_DB[status] },
  });
}

export async function clearConnectorState(organizationId: string): Promise<void> {
  await prisma.$transaction([
    prisma.bankAccount.deleteMany({ where: { organizationId } }),
    prisma.bankConnectorState.deleteMany({ where: { organizationId } }),
  ]);
}
