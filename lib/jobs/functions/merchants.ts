/**
 * Merchant normalization job — subscribes to ledger/transaction.imported
 * and ledger/email.parsed (post-match). Orchestrates
 * lib/merchant/engine.ts::extractMerchant (unchanged, pure) and
 * services/merchants/merchant-service.ts::registerMerchant (which already
 * performs first-sight enrichment internally — see that service's own
 * comment — so no separate "enrichment" step is needed here).
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { extractMerchant } from "@/lib/merchant/engine";
import * as merchantService from "@/services/merchants/merchant-service";
import * as transactionService from "@/services/transactions/transaction-service";
import type { EventPayload } from "@/lib/jobs/events";

type Trigger =
  | EventPayload<"ledger/transaction.imported">
  | EventPayload<"ledger/email.parsed">;

export const merchantNormalize = defineJob<Trigger>(
  {
    id: "merchant-normalize",
    name: "Merchant Normalization",
    trigger: [{ event: "ledger/transaction.imported" }, { event: "ledger/email.parsed" }],
    concurrency: [orgConcurrency(5), globalConcurrency(40)],
  },
  async ({ event, organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };

    const transactionIds =
      event.name === "ledger/transaction.imported"
        ? (event.data as EventPayload<"ledger/transaction.imported">).transactionIds
        : (event.data as EventPayload<"ledger/email.parsed">).matchedTransactionIds;

    const merchantsByTransaction = await step.run("extract-and-register", async () => {
      const results: { transactionId: string; merchantId: string }[] = [];
      for (const transactionId of transactionIds) {
        const transaction = await transactionService.getTransactionById(organizationId, transactionId);
        if (!transaction) continue;

        const extraction = extractMerchant(transaction.note);
        if (!extraction) continue;

        const merchant = await merchantService.registerMerchant(organizationId, {
          canonicalName: extraction.name,
          categoryHint: extraction.categoryHint,
          confidence: extraction.confidence,
        });
        results.push({ transactionId, merchantId: merchant.id });
      }
      return results;
    });

    // Fan out one event per distinct merchant, grouping the transactions
    // that resolved to it — matches events.ts's
    // ledger/merchant.normalized shape (merchantId + transactionIds[]).
    const grouped = new Map<string, string[]>();
    for (const { transactionId, merchantId } of merchantsByTransaction) {
      grouped.set(merchantId, [...(grouped.get(merchantId) ?? []), transactionId]);
    }

    for (const [merchantId, ids] of grouped) {
      await dispatch(
        "ledger/merchant.normalized",
        { organizationId, correlationId, merchantId, transactionIds: ids },
        { id: buildKey("merchant-normalized", merchantId, correlationId) },
      );
    }

    return { merchantsResolved: grouped.size, transactionsProcessed: merchantsByTransaction.length };
  },
);
