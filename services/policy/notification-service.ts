/**
 * Notification Service — the async, Postgres-backed successor to
 * lib/policy/registry.ts + lib/policy/preferences.ts +
 * lib/policy/cooldown.ts's persisted half. cooldownWindowFor and
 * DEFAULT_COOLDOWN_WINDOWS_MS stay pure in lib/policy/cooldown.ts,
 * unchanged — this is the one place that combines them with a real
 * Postgres read.
 */
import { cooldownWindowFor } from "@/lib/policy/cooldown";
import * as notificationRepository from "@/repositories/notification-repository";
import type { NotificationCandidate, NotificationPreferences, PolicyDecision } from "@/types/policy";
import type { FeedItemType } from "@/types/feed";

export async function upsertCandidate(
  organizationId: string,
  candidate: NotificationCandidate,
): Promise<NotificationCandidate> {
  return notificationRepository.upsertCandidate(organizationId, candidate);
}

export async function reconcileCandidates(
  organizationId: string,
  candidates: NotificationCandidate[],
): Promise<NotificationCandidate[]> {
  return notificationRepository.reconcileCandidates(organizationId, candidates);
}

export async function listCandidates(organizationId: string): Promise<NotificationCandidate[]> {
  return notificationRepository.getAllCandidates(organizationId);
}

export async function getCandidateById(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  return notificationRepository.getCandidateById(organizationId, id);
}

export async function getCandidatesByDecision(
  organizationId: string,
  decision: PolicyDecision,
): Promise<NotificationCandidate[]> {
  return notificationRepository.getCandidatesByDecision(organizationId, decision);
}

export async function getCandidatesBySourceEngine(
  organizationId: string,
  sourceEngine: NotificationCandidate["sourceEngine"],
): Promise<NotificationCandidate[]> {
  return notificationRepository.getCandidatesBySourceEngine(organizationId, sourceEngine);
}

export async function getAuditTrail(organizationId: string): Promise<NotificationCandidate[]> {
  return notificationRepository.getAuditTrail(organizationId);
}

export async function overrideDecision(
  organizationId: string,
  id: string,
  decision: PolicyDecision,
): Promise<NotificationCandidate | undefined> {
  return notificationRepository.overrideDecision(organizationId, id, decision);
}

export async function restoreDecision(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  return notificationRepository.restoreDecision(organizationId, id);
}

export async function archiveCandidate(
  organizationId: string,
  id: string,
): Promise<NotificationCandidate | undefined> {
  return notificationRepository.archiveCandidate(organizationId, id);
}

export async function expireCandidates(organizationId: string, now: Date = new Date()): Promise<void> {
  return notificationRepository.expireCandidates(organizationId, now);
}

export async function clearCandidates(organizationId: string): Promise<void> {
  return notificationRepository.clearCandidates(organizationId);
}

// --- preferences -------------------------------------------------------------

export async function getPreferences(organizationId: string): Promise<NotificationPreferences> {
  return notificationRepository.getPreferences(organizationId);
}

export async function updatePreferences(
  organizationId: string,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const current = await notificationRepository.getPreferences(organizationId);
  const next: NotificationPreferences = {
    ...current,
    ...patch,
    quietHours: { ...current.quietHours, ...(patch.quietHours ?? {}) },
  };
  return notificationRepository.savePreferences(organizationId, next);
}

export async function resetPreferences(organizationId: string): Promise<NotificationPreferences> {
  return notificationRepository.resetPreferences(organizationId);
}

// --- cooldown ------------------------------------------------------------------

export { cooldownWindowFor };

/**
 * True when a fresh "Notify Immediately" / "Schedule Later" firing should
 * be suppressed for this cooldownKey — mirrors lib/policy/cooldown.ts::
 * isSuppressedByCooldown exactly, now reading from Postgres instead of
 * localStorage.
 */
export async function isSuppressedByCooldown(
  organizationId: string,
  cooldownKey: string,
  contentSignature: string,
  windowMs: number,
  now: Date,
): Promise<boolean> {
  const state = await notificationRepository.getCooldownState(organizationId, cooldownKey);
  if (!state) return false;
  const withinWindow = now.getTime() - new Date(state.lastFiredAt).getTime() < windowMs;
  const contentUnchanged = state.lastContentSignature === contentSignature;
  return withinWindow || contentUnchanged;
}

export async function recordFiring(
  organizationId: string,
  cooldownKey: string,
  contentSignature: string,
  now: Date,
): Promise<void> {
  return notificationRepository.recordFiring(organizationId, cooldownKey, contentSignature, now);
}

export async function clearCooldowns(organizationId: string): Promise<void> {
  return notificationRepository.clearCooldowns(organizationId);
}

/** Convenience: cooldown-window lookup + suppression check in one call,
 * for callers evaluating a specific feed item type. */
export async function isSuppressedForFeedType(
  organizationId: string,
  feedType: FeedItemType,
  cooldownKey: string,
  contentSignature: string,
  now: Date,
): Promise<boolean> {
  return isSuppressedByCooldown(organizationId, cooldownKey, contentSignature, cooldownWindowFor(feedType), now);
}
