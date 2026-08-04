-- Fixes a multi-tenant correctness bug: WorkflowDefinition.id and FeedItem.id
-- previously held the deterministic strings (e.g. "workflow:budget-exceeded",
-- "feed:budget:warning:${statusId}") as the GLOBAL primary key, but both
-- tables are scoped per-Organization — a global-uniqueness id would let
-- only one organization in the entire system ever own a given built-in
-- workflow or feed item. `id` is now an auto-generated cuid; the
-- deterministic string moves to a `key` column, unique per organization.
-- Both tables are empty at this point (no app code writes to them yet),
-- so this is a pure additive change, no backfill needed.

ALTER TABLE "workflow_definitions" ADD COLUMN "key" TEXT NOT NULL;
CREATE UNIQUE INDEX "workflow_definitions_organizationId_key_key" ON "workflow_definitions"("organizationId", "key");

ALTER TABLE "feed_items" ADD COLUMN "key" TEXT NOT NULL;
CREATE UNIQUE INDEX "feed_items_organizationId_key_key" ON "feed_items"("organizationId", "key");
