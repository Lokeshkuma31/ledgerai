/**
 * Notification Service — thin pass-through to repositories/
 * notification-repository.ts, added for the job platform (no services/*
 * wrapper existed before; only the repository did). lib/policy/engine.ts's
 * evaluateNotificationPolicy stays exactly as-is; this is what jobs use to
 * persist its output and check/record cooldown state against the real
 * database instead of that module's localStorage-backed helpers.
 */
import * as notificationRepository from "@/repositories/notification-repository";
import type { CooldownState } from "@/repositories/notification-repository";
import type { NotificationCandidate, NotificationPreferences } from "@/types/policy";

export async function getPreferences(organizationId: string): Promise<NotificationPreferences> {
  return notificationRepository.getPreferences(organizationId);
}

export async function upsertCandidate(
  organizationId: string,
  candidate: NotificationCandidate,
): Promise<NotificationCandidate> {
  return notificationRepository.upsertCandidate(organizationId, candidate);
}

export async function getCooldownState(
  organizationId: string,
  cooldownKey: string,
): Promise<CooldownState | undefined> {
  return notificationRepository.getCooldownState(organizationId, cooldownKey);
}

export async function recordFiring(
  organizationId: string,
  cooldownKey: string,
  contentSignature: string,
  now: Date,
): Promise<void> {
  return notificationRepository.recordFiring(organizationId, cooldownKey, contentSignature, now);
}
