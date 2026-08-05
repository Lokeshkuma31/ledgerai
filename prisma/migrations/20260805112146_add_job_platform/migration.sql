-- This migration was originally generated with spurious drift-correction
-- statements (DROP INDEX / ALTER COLUMN ... DROP DEFAULT against the
-- documents/feed_items/merchants/recommendations/transactions.searchVector
-- generated tsvector columns, and sessions.updatedAt) that Prisma's
-- migrate-diff engine mis-detected as pending changes versus schema.prisma
-- — those columns are populated by generated-column expressions from
-- earlier hand-written migrations (20260803164000_add_fts_search_vectors),
-- which `prisma migrate diff`'s shadow-database comparison does not model
-- correctly. Applying DROP DEFAULT against a generated column errors in
-- Postgres outright (see this migration's original failed apply, DB error
-- 42601); the statements have been removed here rather than "fixed" since
-- they were never a real, intended change — only this migration's actual
-- job_runs/job_dead_letters DDL below is.

-- CreateEnum
-- Wrapped in DO/EXCEPTION rather than a plain CREATE TYPE (Postgres has no
-- CREATE TYPE IF NOT EXISTS): this migration's first, partially-failed
-- apply attempt already committed this enum before erroring on the
-- spurious drift statements below it — Prisma's migration runner does not
-- wrap an entire migration.sql in one transaction, so the enum survived
-- the later statement's rollback. A plain CREATE TYPE here would error
-- "type already exists" on databases (like this one) that hit that first
-- attempt, while still being required for any fresh database (shadow DB,
-- CI, another developer, production) that never did.
DO $$ BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "inngestEventId" TEXT NOT NULL,
    "inngestRunId" TEXT,
    "organizationId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER,
    "correlationId" TEXT NOT NULL,
    "traceId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "relatedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_dead_letters" (
    "id" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "organizationId" TEXT,
    "eventPayload" JSONB NOT NULL,
    "error" JSONB NOT NULL,
    "originalRunId" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "retryOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_inngestEventId_key" ON "job_runs"("inngestEventId");

-- CreateIndex
CREATE INDEX "job_runs_organizationId_createdAt_idx" ON "job_runs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "job_runs_jobType_status_idx" ON "job_runs"("jobType", "status");

-- CreateIndex
CREATE INDEX "job_runs_status_startedAt_idx" ON "job_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_correlationId_idx" ON "job_runs"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "job_dead_letters_jobRunId_key" ON "job_dead_letters"("jobRunId");

-- CreateIndex
CREATE INDEX "job_dead_letters_organizationId_resolvedAt_idx" ON "job_dead_letters"("organizationId", "resolvedAt");

-- CreateIndex
CREATE INDEX "job_dead_letters_jobType_idx" ON "job_dead_letters"("jobType");

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_dead_letters" ADD CONSTRAINT "job_dead_letters_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "job_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_dead_letters" ADD CONSTRAINT "job_dead_letters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
