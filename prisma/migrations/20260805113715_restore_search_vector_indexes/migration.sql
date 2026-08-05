-- Restores the 5 full-text-search GIN indexes from
-- 20260803164000_add_fts_search_vectors, which this migration set's
-- earlier job-platform migration (20260805112146_add_job_platform)
-- unintentionally dropped: its first, partially-failed apply attempt
-- issued DROP INDEX statements ahead of the AlterTable statement that
-- actually errored (Postgres commits each DDL statement in that migration
-- runner independently rather than as one transaction — see that
-- migration's own header comment), so the five DROP INDEX calls
-- committed despite the migration as a whole being marked failed.
--
-- The underlying generated tsvector columns and their data were never
-- touched (only the index over them was dropped) — this is a read-path
-- performance restoration, not a data or correctness fix. Index
-- definitions are copied verbatim from 20260803164000_add_fts_search_vectors.
CREATE INDEX IF NOT EXISTS "transactions_searchVector_idx" ON "transactions" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "merchants_searchVector_idx" ON "merchants" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "documents_searchVector_idx" ON "documents" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "feed_items_searchVector_idx" ON "feed_items" USING GIN ("searchVector");
CREATE INDEX IF NOT EXISTS "recommendations_searchVector_idx" ON "recommendations" USING GIN ("searchVector");
