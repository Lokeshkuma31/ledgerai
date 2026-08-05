/**
 * Classification job — subscribes to ledger/merchant.normalized (post
 * merchant-normalize) and ledger/transaction.created (direct path, e.g.
 * manual entry). Orchestrates lib/ai/classifier.ts::classifyTransaction
 * (unchanged, pure) and persists via services/transactions/
 * transaction-service.ts::updateClassification. No classification rule
 * lives here — this only sequences the existing call and reports the
 * outcome as an event.
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { orgConcurrency, globalConcurrency } from "@/lib/jobs/queue";
import { classifyTransaction } from "@/lib/ai/classifier";
import * as transactionService from "@/services/transactions/transaction-service";
import type { EventPayload } from "@/lib/jobs/events";
import type { Category } from "@/types/transaction";

type Trigger =
  | EventPayload<"ledger/transaction.created">
  | EventPayload<"ledger/merchant.normalized">;

async function classifyOne(organizationId: string, transactionId: string, correlationId: string) {
  const existing = await transactionService.getTransactionById(organizationId, transactionId);
  if (!existing) return;

  const result = classifyTransaction(existing.note);
  const updated = await transactionService.updateClassification(
    organizationId,
    transactionId,
    result.category as Category,
    "classifier",
  );

  await dispatch(
    "ledger/transaction.classified",
    {
      organizationId,
      correlationId,
      transactionId,
      categoryId: updated.aiCategory ?? null,
      classificationSource: "classifier",
    },
    { id: buildKey("transaction-classified", transactionId) },
  );
}

export const classification = defineJob<Trigger>(
  {
    id: "classification",
    name: "Transaction Classification",
    trigger: [{ event: "ledger/transaction.created" }, { event: "ledger/merchant.normalized" }],
    concurrency: [orgConcurrency(5), globalConcurrency(30)],
  },
  async ({ event, organizationId, correlationId, step }) => {
    if (!organizationId) return { skipped: true };

    const transactionIds =
      event.name === "ledger/transaction.created"
        ? [(event.data as EventPayload<"ledger/transaction.created">).transactionId]
        : (event.data as EventPayload<"ledger/merchant.normalized">).transactionIds;

    for (const transactionId of transactionIds) {
      await step.run(`classify-${transactionId}`, () => classifyOne(organizationId, transactionId, correlationId));
    }
    return { classified: transactionIds.length };
  },
);
