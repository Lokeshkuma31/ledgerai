/**
 * Transaction Repository — Postgres-backed persistence for the app's core
 * financial data (the successor to lib/storage.ts's localStorage store).
 * The only module that imports @prisma/client for Transaction rows;
 * services/transactions/transaction-service.ts is the caller-facing layer.
 * Structurally mirrors repositories/connection-repository.ts (enum maps,
 * a mapper function back to the app's existing Transaction type).
 *
 * Transaction.merchantId is a real FK to Merchant (onDelete: SetNull).
 * Until the Merchant domain has its own repository (next in the migration
 * roadmap), callers must only pass a merchantId that already exists as a
 * Merchant row, or omit it — Postgres will reject an unknown id, unlike
 * localStorage which never enforced this relationship.
 */
import { prisma } from "@/lib/db/prisma";
import { categoryLabel, getCategoryCache, resolveCategoryId } from "@/repositories/category-repository";
import type {
  ClassificationSource as PrismaClassificationSource,
  Prisma,
  PaymentMethod as PrismaPaymentMethod,
  Transaction as PrismaTransaction,
} from "@/src/generated/prisma/client";
import type {
  Category,
  ClassificationSource,
  PaymentMethod,
  Transaction,
} from "@/types/transaction";

/** A bare PrismaClient or the callback client inside prisma.$transaction —
 * both expose the same `.transaction` delegate, so functions below can be
 * called either standalone or composed into a caller's own transaction. */
type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

const PAYMENT_METHOD_TO_DB: Record<PaymentMethod, PrismaPaymentMethod> = {
  UPI: "UPI",
  "Debit Card": "DEBIT_CARD",
  "Credit Card": "CREDIT_CARD",
  Cash: "CASH",
  "Net Banking": "NET_BANKING",
};
const PAYMENT_METHOD_FROM_DB: Record<PrismaPaymentMethod, PaymentMethod> = {
  UPI: "UPI",
  DEBIT_CARD: "Debit Card",
  CREDIT_CARD: "Credit Card",
  CASH: "Cash",
  NET_BANKING: "Net Banking",
};

const CLASSIFICATION_SOURCE_TO_DB: Record<ClassificationSource, PrismaClassificationSource> = {
  memory: "MEMORY",
  classifier: "CLASSIFIER",
};
const CLASSIFICATION_SOURCE_FROM_DB: Record<PrismaClassificationSource, ClassificationSource> = {
  MEMORY: "memory",
  CLASSIFIER: "classifier",
};

async function toTransaction(row: PrismaTransaction): Promise<Transaction> {
  const cache = await getCategoryCache();
  return {
    id: row.id,
    amount: row.amount.toNumber(),
    note: row.note,
    paymentMethod: PAYMENT_METHOD_FROM_DB[row.paymentMethod],
    aiCategory: categoryLabel(row.aiCategoryId, cache),
    confidence: row.confidence ?? undefined,
    classificationSource: row.classificationSource
      ? CLASSIFICATION_SOURCE_FROM_DB[row.classificationSource]
      : undefined,
    userCategory: categoryLabel(row.userCategoryId, cache) as Category | undefined,
    reviewed: row.reviewed,
    date: row.date.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    merchantId: row.merchantId ?? undefined,
    merchantName: row.merchantName ?? undefined,
    merchantConfidence: row.merchantConfidence ?? undefined,
  };
}

const sortOrder = [{ date: "desc" as const }, { createdAt: "desc" as const }];

export async function getTransactions(organizationId: string): Promise<Transaction[]> {
  const rows = await prisma.transaction.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: sortOrder,
  });
  return Promise.all(rows.map(toTransaction));
}

export async function getTransactionById(
  organizationId: string,
  id: string,
): Promise<Transaction | undefined> {
  const row = await prisma.transaction.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  return row ? toTransaction(row) : undefined;
}

export async function createTransaction(
  organizationId: string,
  transaction: Transaction,
): Promise<Transaction> {
  const [aiCategoryId, userCategoryId] = await Promise.all([
    resolveCategoryId(transaction.aiCategory),
    resolveCategoryId(transaction.userCategory),
  ]);
  const row = await prisma.transaction.create({
    data: {
      id: transaction.id,
      organizationId,
      amount: transaction.amount.toFixed(2),
      note: transaction.note,
      paymentMethod: PAYMENT_METHOD_TO_DB[transaction.paymentMethod],
      aiCategoryId,
      confidence: transaction.confidence ?? null,
      classificationSource: transaction.classificationSource
        ? CLASSIFICATION_SOURCE_TO_DB[transaction.classificationSource]
        : null,
      userCategoryId,
      reviewed: transaction.reviewed,
      date: new Date(transaction.date),
      createdAt: new Date(transaction.createdAt),
      merchantId: transaction.merchantId ?? null,
      merchantName: transaction.merchantName ?? null,
      merchantConfidence: transaction.merchantConfidence ?? null,
    },
  });
  return toTransaction(row);
}

/** Same as createTransaction, but for bulk sources (e.g. CSV import) —
 * mirrors lib/storage.ts::addTransactions' role, one Prisma call per row
 * since each row may reference a different category, but still cheap
 * relative to a bulk-import user flow. */
export async function createTransactions(
  organizationId: string,
  transactions: Transaction[],
): Promise<Transaction[]> {
  const created: Transaction[] = [];
  for (const transaction of transactions) {
    created.push(await createTransaction(organizationId, transaction));
  }
  return created;
}

export async function updateTransaction(
  organizationId: string,
  id: string,
  patch: { reviewed?: boolean; userCategory?: Category },
): Promise<Transaction> {
  const userCategoryId =
    patch.userCategory !== undefined
      ? await resolveCategoryId(patch.userCategory)
      : undefined;
  const row = await prisma.transaction.update({
    where: { id, organizationId },
    data: {
      ...(patch.reviewed !== undefined ? { reviewed: patch.reviewed } : {}),
      ...(userCategoryId !== undefined ? { userCategoryId } : {}),
    },
  });
  return toTransaction(row);
}

/** Added for the background job platform's classification job
 * (docs/job-platform/03-job-dependency-graph.md) — every existing
 * creation path (createTransaction/createTransactions) already persists
 * an already-classified row, so no update path for aiCategory/
 * classificationSource existed until an async (re-)classification step
 * needed one. Mirrors updateTransaction's shape exactly. */
export async function updateClassification(
  organizationId: string,
  id: string,
  patch: { aiCategory: Category; classificationSource: ClassificationSource },
): Promise<Transaction> {
  const aiCategoryId = await resolveCategoryId(patch.aiCategory);
  const row = await prisma.transaction.update({
    where: { id, organizationId },
    data: {
      aiCategoryId,
      classificationSource: CLASSIFICATION_SOURCE_TO_DB[patch.classificationSource],
    },
  });
  return toTransaction(row);
}

/** Repoints every transaction tagged with fromMerchantId to the merge
 * target, mirroring lib/storage.ts::reassignMerchant. Accepts an optional
 * transaction client so repositories/merchant-repository.ts can compose
 * this into the same prisma.$transaction as the Merchant row's own update
 * — see the migration plan's risk register §7.3 on why this specific
 * boundary needs to be atomic, unlike today's two-unguarded-round-trips
 * localStorage version. */
export async function reassignMerchant(
  organizationId: string,
  fromMerchantId: string,
  toMerchantId: string,
  toMerchantName: string,
  client: PrismaClientLike = prisma,
): Promise<void> {
  await client.transaction.updateMany({
    where: { organizationId, merchantId: fromMerchantId },
    data: { merchantId: toMerchantId, merchantName: toMerchantName },
  });
}

/** Mirrors lib/storage.ts::clearMerchantFromTransactions. Same optional-
 * transaction-client composability as reassignMerchant above. */
export async function clearMerchantFromTransactions(
  organizationId: string,
  merchantId: string,
  client: PrismaClientLike = prisma,
): Promise<void> {
  await client.transaction.updateMany({
    where: { organizationId, merchantId },
    data: { merchantId: null, merchantName: null, merchantConfidence: null },
  });
}
