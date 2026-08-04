-- PolicyDecision's original 3 values (DELIVER/SUPPRESS/DEFER) don't match
-- types/policy.ts's actual 7-value POLICY_DECISIONS taxonomy at all.
-- notification_candidates is confirmed empty, so this is a straight
-- drop-column/drop-type/recreate-type/add-column rather than a data
-- migration — Postgres has no ALTER TYPE ... REPLACE VALUES.
--
-- Also adds NotificationPreferences (a per-organization singleton,
-- distinct from Better Auth-adjacent UserPreferences) and
-- NotificationCooldown (lib/policy/cooldown.ts's successor) — both
-- brand-new concepts with no prior schema representation.
--
-- Hand-written and reviewed before applying, same as the prior 4
-- migrations this session.

-- AlterTable: drop the old enum column first so the type can be dropped.
ALTER TABLE "notification_candidates" DROP COLUMN "policyDecision";

DROP TYPE "PolicyDecision";

CREATE TYPE "PolicyDecision" AS ENUM ('NOTIFY_IMMEDIATELY', 'SCHEDULE_LATER', 'INCLUDE_IN_DAILY_BRIEFING', 'INCLUDE_IN_WEEKLY_SUMMARY', 'SILENT', 'DISMISS', 'EXPIRED');

ALTER TABLE "notification_candidates" ADD COLUMN "policyDecision" "PolicyDecision" NOT NULL;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "organizationId" TEXT NOT NULL,
    "budgetAlerts" BOOLEAN NOT NULL DEFAULT true,
    "forecastAlerts" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionAlerts" BOOLEAN NOT NULL DEFAULT true,
    "achievements" BOOLEAN NOT NULL DEFAULT true,
    "merchantInsights" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "monthlyDigest" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '07:00',
    "preferredChannels" TEXT[],
    "maxNotificationsPerDay" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "notification_cooldowns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cooldownKey" TEXT NOT NULL,
    "lastFiredAt" TIMESTAMP(3) NOT NULL,
    "lastContentSignature" TEXT NOT NULL,

    CONSTRAINT "notification_cooldowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_cooldowns_organizationId_cooldownKey_key" ON "notification_cooldowns"("organizationId", "cooldownKey");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_cooldowns" ADD CONSTRAINT "notification_cooldowns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
