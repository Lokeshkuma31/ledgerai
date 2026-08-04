/**
 * Notification Repository — Postgres-backed persistence for
 * lib/policy/registry.ts (NotificationCandidate) + lib/policy/
 * preferences.ts (NotificationPreferences) + lib/policy/cooldown.ts's
 * persisted half (NotificationCooldown). lib/policy/cooldown.ts's pure
 * cooldownWindowFor/DEFAULT_COOLDOWN_WINDOWS_MS stay exactly where they
 * are — no persistence, nothing to migrate.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";
import type {
  NotificationCandidate as PrismaNotificationCandidate,
  NotificationPreferences as PrismaNotificationPreferences,
  PolicyDecision as PrismaPolicyDecision,
} from "@/src/generated/prisma/client";
import type {
  NotificationCandidate,
  NotificationChannel,
  NotificationPreferences,
  PolicyDecision,
} from "@/types/policy";
import type { FeedSeverity, FeedSourceEngine } from "@/types/feed";

const DECISION_TO_DB: Record<PolicyDecision, PrismaPolicyDecision> = {
  "notify-immediately": "NOTIFY_IMMEDIATELY",
  "schedule-later": "SCHEDULE_LATER",
  "include-in-daily-briefing": "INCLUDE_IN_DAILY_BRIEFING",
  "include-in-weekly-summary": "INCLUDE_IN_WEEKLY_SUMMARY",
  silent: "SILENT",
  dismiss: "DISMISS",
  expired: "EXPIRED",
};
const DECISION_FROM_DB: Record<PrismaPolicyDecision, PolicyDecision> = {
  NOTIFY_IMMEDIATELY: "notify-immediately",
  SCHEDULE_LATER: "schedule-later",
  INCLUDE_IN_DAILY_BRIEFING: "include-in-daily-briefing",
  INCLUDE_IN_WEEKLY_SUMMARY: "include-in-weekly-summary",
  SILENT: "silent",
  DISMISS: "dismiss",
  EXPIRED: "expired",
};

function toCandidate(row: PrismaNotificationCandidate): NotificationCandidate {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    severity: row.severity as FeedSeverity,
    reason: row.reason,
    sourceEngine: row.sourceEngine as FeedSourceEngine,
    relatedObjectIds: row.relatedObjectIds,
    recommendedChannels: row.recommendedChannels as NotificationChannel[],
    recommendedTime: row.recommendedTime?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    cooldownKey: row.cooldownKey,
    confidence: row.confidence,
    policyDecision: DECISION_FROM_DB[row.policyDecision],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

function candidateData(organizationId: string, candidate: NotificationCandidate) {
  return {
    organizationId,
    title: candidate.title,
    summary: candidate.summary,
    priority: candidate.priority,
    severity: candidate.severity,
    reason: candidate.reason,
    sourceEngine: candidate.sourceEngine,
    relatedObjectIds: candidate.relatedObjectIds,
    recommendedChannels: candidate.recommendedChannels,
    recommendedTime: candidate.recommendedTime ? new Date(candidate.recommendedTime) : null,
    expiresAt: candidate.expiresAt ? new Date(candidate.expiresAt) : null,
    cooldownKey: candidate.cooldownKey,
    confidence: candidate.confidence,
    policyDecision: DECISION_TO_DB[candidate.policyDecision],
    metadata: candidate.metadata as Prisma.InputJsonValue,
  };
}

/**
 * Persists one freshly evaluated candidate, preserving createdAt and
 * re-applying any manual override already on record for the same
 * (stable, deterministic) id — mirrors lib/policy/registry.ts::
 * upsertCandidate exactly, including the "a manual override always wins
 * over the freshly computed decision" behavior.
 */
export async function upsertCandidate(
  organizationId: string,
  candidate: NotificationCandidate,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<NotificationCandidate> {
  const existing = await client.notificationCandidate.findUnique({ where: { id: candidate.id } });

  if (!existing) {
    const row = await client.notificationCandidate.create({
      data: { id: candidate.id, ...candidateData(organizationId, candidate) },
    });
    return toCandidate(row);
  }

  const priorMetadata = (existing.metadata as Record<string, unknown>) ?? {};
  const overriddenDecision = priorMetadata.overriddenDecision as PolicyDecision | undefined;
  const effectiveCandidate: NotificationCandidate = overriddenDecision
    ? {
        ...candidate,
        policyDecision: overriddenDecision,
        metadata: {
          ...candidate.metadata,
          overriddenDecision,
          originalDecision: candidate.policyDecision,
        },
      }
    : candidate;

  const row = await client.notificationCandidate.update({
    where: { id: candidate.id },
    data: candidateData(organizationId, effectiveCandidate),
    // createdAt intentionally absent — immutable once set.
  });
  return toCandidate(row);
}

/** Upserts a full evaluation batch and deletes any previously persisted
 * candidate whose id wasn't regenerated this run, mirroring
 * lib/policy/registry.ts::reconcileCandidates exactly (same
 * upsert-then-full-replace semantic as Feed's reconcileFeedItems). */
export async function reconcileCandidates(
  organizationId: string,
  candidates: NotificationCandidate[],
): Promise<NotificationCandidate[]> {
  return prisma.$transaction(async (tx) => {
    const reconciled = await Promise.all(
      candidates.map((candidate) => upsertCandidate(organizationId, candidate, tx)),
    );
    await tx.notificationCandidate.deleteMany({
      where: { organizationId, id: { notIn: candidates.map((c) => c.id) } },
    });
    return reconciled;
  });
}

export async function getAllCandidates(organizationId: string): Promise<NotificationCandidate[]> {
  const rows = await prisma.notificationCandidate.findMany({ where: { organizationId } });
  return rows.map(toCandidate);
}

export async function getCandidateById(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  const row = await prisma.notificationCandidate.findFirst({ where: { id, organizationId } });
  return row ? toCandidate(row) : undefined;
}

export async function getCandidatesByDecision(
  organizationId: string,
  decision: PolicyDecision,
): Promise<NotificationCandidate[]> {
  const rows = await prisma.notificationCandidate.findMany({
    where: { organizationId, policyDecision: DECISION_TO_DB[decision] },
  });
  return rows.map(toCandidate);
}

export async function getCandidatesBySourceEngine(
  organizationId: string,
  sourceEngine: FeedSourceEngine,
): Promise<NotificationCandidate[]> {
  const rows = await prisma.notificationCandidate.findMany({
    where: { organizationId, sourceEngine },
  });
  return rows.map(toCandidate);
}

/** Newest first — the full persisted history doubles as the audit trail. */
export async function getAuditTrail(organizationId: string): Promise<NotificationCandidate[]> {
  const rows = await prisma.notificationCandidate.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCandidate);
}

/** Manually overrides a candidate's policy decision — sticks across
 * regenerations (upsertCandidate re-applies it every time) until
 * restoreDecision clears it. Mirrors lib/policy/registry.ts::overrideDecision. */
export async function overrideDecision(
  organizationId: string,
  id: string,
  decision: PolicyDecision,
): Promise<NotificationCandidate | undefined> {
  const existing = await prisma.notificationCandidate.findFirst({ where: { id, organizationId } });
  if (!existing) return undefined;
  const priorMetadata = (existing.metadata as Record<string, unknown>) ?? {};

  const row = await prisma.notificationCandidate.update({
    where: { id },
    data: {
      policyDecision: DECISION_TO_DB[decision],
      metadata: {
        ...priorMetadata,
        overriddenDecision: decision,
        originalDecision: priorMetadata.originalDecision ?? DECISION_FROM_DB[existing.policyDecision],
      } as Prisma.InputJsonValue,
    },
  });
  return toCandidate(row);
}

/** Clears a manual override, letting the next evaluation's computed
 * decision take effect again. Mirrors lib/policy/registry.ts::restoreDecision. */
export async function restoreDecision(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  const existing = await prisma.notificationCandidate.findFirst({ where: { id, organizationId } });
  if (!existing) return undefined;
  const metadata = { ...((existing.metadata as Record<string, unknown>) ?? {}) };
  const originalDecision = metadata.originalDecision as PolicyDecision | undefined;
  delete metadata.overriddenDecision;
  delete metadata.originalDecision;

  const row = await prisma.notificationCandidate.update({
    where: { id },
    data: {
      policyDecision: originalDecision ? DECISION_TO_DB[originalDecision] : existing.policyDecision,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
  return toCandidate(row);
}

/** Archiving is an override to "dismiss" — mirrors lib/policy/registry.ts::
 * archiveCandidate. */
export async function archiveCandidate(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  return overrideDecision(organizationId, id, "dismiss");
}

/** Marks any candidate whose expiresAt has passed as "expired" in place. */
export async function expireCandidates(organizationId: string, now: Date = new Date()): Promise<void> {
  await prisma.notificationCandidate.updateMany({
    where: {
      organizationId,
      expiresAt: { lte: now },
      policyDecision: { not: "EXPIRED" },
    },
    data: { policyDecision: "EXPIRED" },
  });
}

export async function clearCandidates(organizationId: string): Promise<void> {
  await prisma.notificationCandidate.deleteMany({ where: { organizationId } });
}

// --- preferences (lib/policy/preferences.ts's successor) -------------------

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  budgetAlerts: true,
  forecastAlerts: true,
  subscriptionAlerts: true,
  achievements: true,
  merchantInsights: true,
  weeklyDigest: true,
  monthlyDigest: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  preferredChannels: ["dashboard-feed", "push"],
  maxNotificationsPerDay: 10,
};

function toPreferences(row: PrismaNotificationPreferences): NotificationPreferences {
  return {
    budgetAlerts: row.budgetAlerts,
    forecastAlerts: row.forecastAlerts,
    subscriptionAlerts: row.subscriptionAlerts,
    achievements: row.achievements,
    merchantInsights: row.merchantInsights,
    weeklyDigest: row.weeklyDigest,
    monthlyDigest: row.monthlyDigest,
    quietHours: {
      enabled: row.quietHoursEnabled,
      start: row.quietHoursStart,
      end: row.quietHoursEnd,
    },
    preferredChannels: row.preferredChannels as NotificationChannel[],
    maxNotificationsPerDay: row.maxNotificationsPerDay,
  };
}

/** Falls back to defaults when nothing is persisted yet — mirrors
 * lib/policy/preferences.ts::getPreferences' defensive fallback. */
export async function getPreferences(organizationId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreferences.findUnique({ where: { organizationId } });
  return row ? toPreferences(row) : DEFAULT_PREFERENCES;
}

export async function savePreferences(
  organizationId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const data = {
    budgetAlerts: preferences.budgetAlerts,
    forecastAlerts: preferences.forecastAlerts,
    subscriptionAlerts: preferences.subscriptionAlerts,
    achievements: preferences.achievements,
    merchantInsights: preferences.merchantInsights,
    weeklyDigest: preferences.weeklyDigest,
    monthlyDigest: preferences.monthlyDigest,
    quietHoursEnabled: preferences.quietHours.enabled,
    quietHoursStart: preferences.quietHours.start,
    quietHoursEnd: preferences.quietHours.end,
    preferredChannels: preferences.preferredChannels,
    maxNotificationsPerDay: preferences.maxNotificationsPerDay,
  };
  const row = await prisma.notificationPreferences.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
  return toPreferences(row);
}

export async function resetPreferences(organizationId: string): Promise<NotificationPreferences> {
  return savePreferences(organizationId, DEFAULT_PREFERENCES);
}

// --- cooldown state (lib/policy/cooldown.ts's persisted half) --------------

export interface CooldownState {
  cooldownKey: string;
  lastFiredAt: string;
  lastContentSignature: string;
}

export async function getCooldownState(
  organizationId: string,
  cooldownKey: string,
): Promise<CooldownState | undefined> {
  const row = await prisma.notificationCooldown.findUnique({
    where: { organizationId_cooldownKey: { organizationId, cooldownKey } },
  });
  return row
    ? {
        cooldownKey: row.cooldownKey,
        lastFiredAt: row.lastFiredAt.toISOString(),
        lastContentSignature: row.lastContentSignature,
      }
    : undefined;
}

export async function recordFiring(
  organizationId: string,
  cooldownKey: string,
  contentSignature: string,
  now: Date,
): Promise<void> {
  await prisma.notificationCooldown.upsert({
    where: { organizationId_cooldownKey: { organizationId, cooldownKey } },
    create: { organizationId, cooldownKey, lastFiredAt: now, lastContentSignature: contentSignature },
    update: { lastFiredAt: now, lastContentSignature: contentSignature },
  });
}

export async function clearCooldowns(organizationId: string): Promise<void> {
  await prisma.notificationCooldown.deleteMany({ where: { organizationId } });
}
