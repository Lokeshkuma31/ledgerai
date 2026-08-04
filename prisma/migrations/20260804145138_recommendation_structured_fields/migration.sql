-- Recommendation gains the structured fields the app actually renders
-- (priority/category/reason/action, split out of the old single `body`
-- text), and confidence becomes optional (reserved for a future
-- LLM-scored recommendation path; the current deterministic rule engine
-- doesn't produce one).
--
-- NOTE: this file was hand-corrected after `prisma migrate dev` generated
-- a diff that also touched every other table's generated `searchVector`
-- column (Unsupported("tsvector") + GENERATED ALWAYS AS ... STORED, from
-- the add_fts_search_vectors migration) — Prisma's schema diff engine
-- doesn't understand generated columns and tried to run invalid
-- `ALTER COLUMN ... DROP DEFAULT` against them, which Postgres rejects
-- (`HINT: Use ALTER TABLE ... ALTER COLUMN ... DROP EXPRESSION instead`).
-- That spurious drift is intentionally NOT included below — only
-- Recommendation's own generated searchVector column is touched, since it
-- must be regenerated to reference `description` instead of the
-- now-dropped `body`.

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationCategory" AS ENUM ('BUDGET', 'SAVINGS', 'SUBSCRIPTIONS', 'SPENDING', 'INCOME', 'HABITS', 'FORECAST', 'GENERAL');

-- DropIndex
DROP INDEX IF EXISTS "recommendations_searchVector_idx";

-- AlterTable
ALTER TABLE "recommendations"
  DROP COLUMN "searchVector",
  DROP COLUMN "body",
  ADD COLUMN "description" TEXT NOT NULL,
  ADD COLUMN "reason" TEXT NOT NULL,
  ADD COLUMN "action" TEXT NOT NULL,
  ADD COLUMN "priority" "RecommendationPriority" NOT NULL,
  ADD COLUMN "category" "RecommendationCategory" NOT NULL,
  ALTER COLUMN "confidence" DROP NOT NULL,
  ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
    ) STORED;

CREATE INDEX "recommendations_searchVector_idx" ON "recommendations" USING GIN ("searchVector");
