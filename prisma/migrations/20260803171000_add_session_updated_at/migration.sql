-- Better Auth's core session schema requires an updatedAt column, which
-- the original Session model was missing.
ALTER TABLE "sessions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
