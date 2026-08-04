-- Full-text search: generated tsvector columns + GIN indexes.
-- Rationale: no separate IndexedObject table (see plan §2/§3) — search
-- queries union across these tables at read time via services/search,
-- avoiding a second copy of the data that could drift out of sync.
-- Prisma's schema language can't express GENERATED ALWAYS AS, so these
-- columns are declared as Unsupported("tsvector") in schema.prisma and
-- defined here via raw SQL.

ALTER TABLE "transactions"
  DROP COLUMN IF EXISTS "searchVector",
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("note", '') || ' ' || coalesce("merchantName", ''))
    ) STORED;

CREATE INDEX "transactions_searchVector_idx" ON "transactions" USING GIN ("searchVector");

ALTER TABLE "merchants"
  DROP COLUMN IF EXISTS "searchVector",
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("canonicalName", '') || ' ' || coalesce("categoryHint", ''))
    ) STORED;

CREATE INDEX "merchants_searchVector_idx" ON "merchants" USING GIN ("searchVector");

ALTER TABLE "documents"
  DROP COLUMN IF EXISTS "searchVector",
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("fileName", ''))
    ) STORED;

CREATE INDEX "documents_searchVector_idx" ON "documents" USING GIN ("searchVector");

ALTER TABLE "feed_items"
  DROP COLUMN IF EXISTS "searchVector",
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("title", '') || ' ' || coalesce("summary", ''))
    ) STORED;

CREATE INDEX "feed_items_searchVector_idx" ON "feed_items" USING GIN ("searchVector");

ALTER TABLE "recommendations"
  DROP COLUMN IF EXISTS "searchVector",
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("title", '') || ' ' || coalesce("body", ''))
    ) STORED;

CREATE INDEX "recommendations_searchVector_idx" ON "recommendations" USING GIN ("searchVector");
