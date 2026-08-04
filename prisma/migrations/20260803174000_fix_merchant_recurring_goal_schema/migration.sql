-- Fixes three schema/reality mismatches found while building the
-- Transaction/Merchant/Budget/Goal/Recurring repositories (plan Phase 1):
-- 1. GoalStatus didn't match GOAL_STATUSES in types/goal.ts at all
--    (ON_TRACK/AT_RISK/BEHIND/ACHIEVED vs the real
--    not-started/in-progress/completed/overdue).
-- 2. RecurringFrequency/RecurringStatus didn't match
--    RECURRING_FREQUENCIES/RECURRING_STATUSES in types/recurring.ts
--    (missing DAILY/PAUSED/STOPPED, had made-up DUE/CANCELLED/IRREGULAR
--    values with no equivalent).
-- 3. MerchantProfile was missing defaultCategory/subcategories/country
--    (part of MerchantKnowledge) and RecurringTransaction was missing
--    daysRemaining/transactionCount/merchantName, plus its `category` was
--    wrongly modeled as a Category FK when the real type is a free-text
--    string (recurring categories aren't restricted to the 11 fixed
--    Transaction categories).
-- All affected tables are empty, so this is a clean rebuild, no backfill.

BEGIN;
CREATE TYPE "GoalStatus_new" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');
ALTER TABLE "goals" ALTER COLUMN "status" TYPE "GoalStatus_new" USING ("status"::text::"GoalStatus_new");
ALTER TYPE "GoalStatus" RENAME TO "GoalStatus_old";
ALTER TYPE "GoalStatus_new" RENAME TO "GoalStatus";
DROP TYPE "GoalStatus_old";
COMMIT;

BEGIN;
CREATE TYPE "RecurringFrequency_new" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'UNKNOWN');
ALTER TABLE "recurring_transactions" ALTER COLUMN "frequency" TYPE "RecurringFrequency_new" USING ("frequency"::text::"RecurringFrequency_new");
ALTER TYPE "RecurringFrequency" RENAME TO "RecurringFrequency_old";
ALTER TYPE "RecurringFrequency_new" RENAME TO "RecurringFrequency";
DROP TYPE "RecurringFrequency_old";
COMMIT;

BEGIN;
CREATE TYPE "RecurringStatus_new" AS ENUM ('ACTIVE', 'UPCOMING', 'MISSED', 'PAUSED', 'STOPPED');
ALTER TABLE "recurring_transactions" ALTER COLUMN "status" TYPE "RecurringStatus_new" USING ("status"::text::"RecurringStatus_new");
ALTER TYPE "RecurringStatus" RENAME TO "RecurringStatus_old";
ALTER TYPE "RecurringStatus_new" RENAME TO "RecurringStatus";
DROP TYPE "RecurringStatus_old";
COMMIT;

ALTER TABLE "recurring_transactions" DROP CONSTRAINT "recurring_transactions_categoryId_fkey";

ALTER TABLE "merchant_profiles" ADD COLUMN     "country" TEXT,
ADD COLUMN     "defaultCategory" TEXT NOT NULL,
ADD COLUMN     "subcategories" TEXT[],
ALTER COLUMN "industry" SET NOT NULL,
ALTER COLUMN "merchantType" SET NOT NULL;

ALTER TABLE "recurring_transactions" DROP COLUMN "categoryId",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "daysRemaining" INTEGER,
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "transactionCount" INTEGER NOT NULL DEFAULT 0;
