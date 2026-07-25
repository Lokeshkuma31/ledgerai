import type { Recommendation, RecommendationStatus } from "@/types/recommendation";

const STORAGE_KEY = "ledgerai:recommendation-status";

interface PersistedStatus {
  status: Extract<RecommendationStatus, "dismissed" | "completed">;
  /** The recommendation's original createdAt, preserved across regenerations. */
  createdAt: string;
}

type StatusMap = Record<string, PersistedStatus>;

function readStatusMap(): StatusMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as StatusMap;
  } catch {
    return {};
  }
}

function writeStatusMap(map: StatusMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function dismissRecommendation(id: string, createdAt: string): void {
  const map = readStatusMap();
  map[id] = { status: "dismissed", createdAt };
  writeStatusMap(map);
}

export function completeRecommendation(id: string, createdAt: string): void {
  const map = readStatusMap();
  map[id] = { status: "completed", createdAt };
  writeStatusMap(map);
}

/**
 * The Decision Engine is a pure function with no memory of prior runs — this
 * merges its freshly generated output with whatever dismiss/complete state
 * was previously persisted for the same (stable, deterministic) ids.
 * Ids with no persisted entry stay "new".
 */
export function applyPersistedStatus(
  recommendations: Recommendation[],
): Recommendation[] {
  const statusMap = readStatusMap();
  return recommendations.map((recommendation) => {
    const persisted = statusMap[recommendation.id];
    if (!persisted) return recommendation;
    return {
      ...recommendation,
      status: persisted.status,
      createdAt: persisted.createdAt,
    };
  });
}
