-- JobRun's uniqueness is per (jobType, inngestEventId), not
-- inngestEventId alone — a single Inngest event can fan out to several
-- subscribing functions (e.g. ledger/transaction.classified triggers
-- both workflow-execute and feed-generate), each with its own execution
-- and its own JobRun row. See prisma/schema.prisma's JobRun model
-- comment and docs/job-platform/08-worker-architecture.md §8.2.
--
-- This corrects 20260805112146_add_job_platform, which shipped with the
-- single-column unique constraint before this fan-out case was caught in
-- testing (see services/jobs/__tests__/job-service.test.ts's fan-out
-- case) — schema.prisma and the generated Prisma client already reflect
-- the composite key; this migration brings the live database in sync.
DROP INDEX "job_runs_inngestEventId_key";
CREATE UNIQUE INDEX "job_runs_jobType_inngestEventId_key" ON "job_runs"("jobType", "inngestEventId");
