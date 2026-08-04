-- Document.r2Key was required, but only documents that go through a real
-- upload (app/api/documents/upload/route.ts) have an R2 object —
-- email-attachment-sourced and mock-fixture-sourced documents don't.
-- documents is confirmed empty; relaxing a NOT NULL constraint is safe
-- regardless. Hand-written and reviewed before applying, same as prior
-- migrations this session.

ALTER TABLE "documents" ALTER COLUMN "r2Key" DROP NOT NULL;
