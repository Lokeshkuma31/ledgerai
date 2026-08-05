/**
 * Search / semantic indexing jobs. search-index is intentionally thin —
 * Transaction/FeedItem/Document/Merchant/Recommendation full-text search
 * is already driven by Postgres GENERATED tsvector columns (see
 * prisma/migrations/20260803164000_add_fts_search_vectors), so there is
 * no separate index-building step to run; this job exists to record
 * completion (observability) and give downstream consumers a stable
 * event to subscribe to for a future non-Postgres index. semantic-index
 * is a stub — no embedding provider is wired yet (see
 * docs/job-platform/09-migration-plan.md §9.4).
 */
import { defineJob } from "@/lib/jobs/worker";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";
import { globalConcurrency } from "@/lib/jobs/queue";
import type { EventPayload } from "@/lib/jobs/events";

type Trigger =
  | EventPayload<"ledger/transaction.classified">
  | EventPayload<"ledger/feed.generated">
  | EventPayload<"ledger/document.parsed">;

function objectRef(event: { name: string; data: Record<string, unknown> }): { type: string; id: string } {
  if ("transactionId" in event.data) return { type: "transaction", id: String(event.data.transactionId) };
  if ("documentId" in event.data) return { type: "document", id: String(event.data.documentId) };
  return { type: "feed", id: String((event.data.feedItemKeys as string[] | undefined)?.[0] ?? "batch") };
}

export const searchIndex = defineJob<Trigger>(
  {
    id: "search-index",
    name: "Search Indexing",
    trigger: [
      { event: "ledger/transaction.classified" },
      { event: "ledger/feed.generated" },
      { event: "ledger/document.parsed" },
    ],
    concurrency: globalConcurrency(25),
  },
  async ({ event, organizationId, correlationId }) => {
    if (!organizationId) return { skipped: true };
    const ref = objectRef(event);
    await dispatch(
      "ledger/search.indexed",
      { organizationId, correlationId, objectType: ref.type, objectId: ref.id },
      { id: buildKey("search-indexed", ref.type, ref.id) },
    );
    return ref;
  },
);

export const semanticIndex = defineJob<Trigger>(
  {
    id: "semantic-index",
    name: "Semantic Indexing",
    trigger: [
      { event: "ledger/transaction.classified" },
      { event: "ledger/feed.generated" },
      { event: "ledger/document.parsed" },
    ],
    concurrency: globalConcurrency(25),
  },
  async ({ event, organizationId, correlationId }) => {
    if (!organizationId) return { skipped: true };
    // No embedding provider wired — see this file's header comment.
    const ref = objectRef(event);
    await dispatch(
      "ledger/semantic.indexed",
      { organizationId, correlationId, objectType: ref.type, objectId: ref.id },
      { id: buildKey("semantic-indexed", ref.type, ref.id) },
    );
    return ref;
  },
);
