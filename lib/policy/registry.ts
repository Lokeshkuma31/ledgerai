import type { NotificationCandidate, PolicyDecision } from "@/types/policy";

const STORAGE_KEY = "ledgerai:policy:candidates";

function readCandidates(): NotificationCandidate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NotificationCandidate[]) : [];
  } catch {
    return [];
  }
}

function writeCandidates(candidates: NotificationCandidate[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates));
}

/**
 * Persists one freshly evaluated candidate, preserving createdAt and any
 * manual override already on record for the same (stable, deterministic)
 * id — a re-evaluated candidate is an update to the same record, not a new
 * one, matching how Feed/Explanation/Recommendation preserve identity
 * across re-runs of their own engines. A manual override (see
 * overrideDecision) always wins over the freshly computed decision.
 */
export function upsertCandidate(candidate: NotificationCandidate): NotificationCandidate {
  const existing = readCandidates();
  const index = existing.findIndex((c) => c.id === candidate.id);
  if (index === -1) {
    const updated = [...existing, candidate];
    writeCandidates(updated);
    return candidate;
  }

  const prior = existing[index];
  const overriddenDecision = prior.metadata.overriddenDecision as PolicyDecision | undefined;
  const persisted: NotificationCandidate = overriddenDecision
    ? {
        ...candidate,
        createdAt: prior.createdAt,
        policyDecision: overriddenDecision,
        metadata: { ...candidate.metadata, overriddenDecision, originalDecision: candidate.policyDecision },
      }
    : { ...candidate, createdAt: prior.createdAt };

  writeCandidates(existing.map((c, i) => (i === index ? persisted : c)));
  return persisted;
}

/** Upserts a full evaluation batch and drops any previously persisted
 * candidate whose id wasn't regenerated this run — its underlying feed
 * item no longer exists or was dismissed upstream. */
export function reconcileCandidates(candidates: NotificationCandidate[]): NotificationCandidate[] {
  const reconciled = candidates.map(upsertCandidate);
  writeCandidates(reconciled);
  return reconciled;
}

export function getAllCandidates(): NotificationCandidate[] {
  return readCandidates();
}

export function getCandidateById(id: string): NotificationCandidate | undefined {
  return readCandidates().find((c) => c.id === id);
}

export function getCandidatesByDecision(decision: PolicyDecision): NotificationCandidate[] {
  return readCandidates().filter((c) => c.policyDecision === decision);
}

export function getCandidatesBySourceEngine(sourceEngine: NotificationCandidate["sourceEngine"]): NotificationCandidate[] {
  return readCandidates().filter((c) => c.sourceEngine === sourceEngine);
}

/**
 * The full persisted history doubles as the audit trail — every decision
 * this engine has made for a still-tracked candidate, newest first.
 */
export function getAuditTrail(): NotificationCandidate[] {
  return [...readCandidates()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Manually overrides a candidate's policy decision (e.g. from the
 * Notification Preview UI). The override sticks across regenerations —
 * upsertCandidate re-applies it every time the underlying feed item is
 * re-evaluated — until restoreDecision clears it.
 */
export function overrideDecision(id: string, decision: PolicyDecision): NotificationCandidate | undefined {
  const candidates = readCandidates();
  const index = candidates.findIndex((c) => c.id === id);
  if (index === -1) return undefined;
  const updated: NotificationCandidate = {
    ...candidates[index],
    policyDecision: decision,
    metadata: {
      ...candidates[index].metadata,
      overriddenDecision: decision,
      originalDecision: candidates[index].metadata.originalDecision ?? candidates[index].policyDecision,
    },
  };
  writeCandidates(candidates.map((c, i) => (i === index ? updated : c)));
  return updated;
}

/** Clears a manual override, letting the next evaluation's computed
 * decision take effect again. */
export function restoreDecision(id: string): NotificationCandidate | undefined {
  const candidates = readCandidates();
  const index = candidates.findIndex((c) => c.id === id);
  if (index === -1) return undefined;
  const current = candidates[index];
  const originalDecision = current.metadata.originalDecision as PolicyDecision | undefined;
  const metadata = { ...current.metadata };
  delete metadata.overriddenDecision;
  delete metadata.originalDecision;
  const updated: NotificationCandidate = {
    ...current,
    policyDecision: originalDecision ?? current.policyDecision,
    metadata,
  };
  writeCandidates(candidates.map((c, i) => (i === index ? updated : c)));
  return updated;
}

/** Archiving is an override to "dismiss" — reuses the same override
 * mechanism rather than adding a separate boolean the fixed model doesn't have. */
export function archiveCandidate(id: string): NotificationCandidate | undefined {
  return overrideDecision(id, "dismiss");
}

/** Marks any candidate whose expiresAt has passed as "expired" in place. */
export function expireCandidates(now: Date = new Date()): NotificationCandidate[] {
  const candidates = readCandidates();
  const nowIso = now.toISOString();
  const updated = candidates.map((c) =>
    c.expiresAt && c.expiresAt <= nowIso && c.policyDecision !== "expired"
      ? { ...c, policyDecision: "expired" as PolicyDecision }
      : c,
  );
  writeCandidates(updated);
  return updated;
}

export function clearCandidates(): void {
  writeCandidates([]);
}
