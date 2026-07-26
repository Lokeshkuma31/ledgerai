import type { Explanation, ExplainableObjectType } from "@/types/explanation";

const STORAGE_KEY = "ledgerai:explanations";

function readExplanations(): Explanation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Explanation[]) : [];
  } catch {
    return [];
  }
}

function writeExplanations(explanations: Explanation[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(explanations));
}

/**
 * Persists a freshly-built explanation, preserving the original
 * `generatedAt` if one was already on record for this object — a
 * regenerated explanation is an update to the same record, not a new one,
 * matching how recommendations/merchants preserve identity across
 * re-runs of their own engines.
 */
export function upsertExplanation(explanation: Explanation): Explanation {
  const existing = readExplanations();
  const index = existing.findIndex((e) => e.id === explanation.id);
  const persisted: Explanation =
    index === -1 ? explanation : { ...explanation, generatedAt: existing[index].generatedAt };

  const updated = index === -1 ? [...existing, persisted] : existing.map((e, i) => (i === index ? persisted : e));
  writeExplanations(updated);
  return persisted;
}

export function getAllExplanations(): Explanation[] {
  return readExplanations();
}

export function getExplanationById(id: string): Explanation | undefined {
  return readExplanations().find((e) => e.id === id);
}

export function getExplanationByObject(objectType: ExplainableObjectType, objectId: string): Explanation | undefined {
  return getExplanationById(`${objectType}:${objectId}`);
}

export function getExplanationsByType(objectType: ExplainableObjectType): Explanation[] {
  return readExplanations().filter((e) => e.objectType === objectType);
}

export function getExplanationsByMerchant(merchant: string): Explanation[] {
  const lower = merchant.toLowerCase();
  return readExplanations().filter((e) =>
    e.relatedObjects.some((r) => r.type === "merchant" && r.label.toLowerCase() === lower),
  );
}

export function getExplanationsByCategory(category: string): Explanation[] {
  const lower = category.toLowerCase();
  return readExplanations().filter((e) =>
    e.relatedObjects.some((r) => r.type === "category" && r.label.toLowerCase() === lower),
  );
}

export function getExplanationsByTag(tag: string): Explanation[] {
  const lower = tag.toLowerCase();
  return readExplanations().filter((e) => e.tags.some((t) => t.toLowerCase() === lower));
}

/** Matches explanations generated on a given calendar date ("YYYY-MM-DD"). */
export function getExplanationsByDate(date: string): Explanation[] {
  return readExplanations().filter((e) => e.generatedAt.slice(0, 10) === date);
}

export function clearExplanations(): void {
  writeExplanations([]);
}
