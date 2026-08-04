/**
 * Recommendation Service — the async, Postgres-backed successor to
 * lib/decision/storage.ts. lib/decision/engine.ts::generateRecommendations
 * is pure and unchanged; this service reconciles its fresh output against
 * persisted status via repositories/recommendation-repository.ts instead
 * of the old localStorage overlay map.
 */
import {
  generateRecommendations,
  type GenerateRecommendationsInput,
} from "@/lib/decision/engine";
import * as recommendationRepository from "@/repositories/recommendation-repository";
import type { Recommendation } from "@/types/recommendation";

/** Regenerates recommendations from the given input and reconciles them
 * against Postgres — the direct successor to calling
 * lib/decision/engine.ts::generateRecommendations followed by
 * lib/decision/storage.ts::applyPersistedStatus. */
export async function getRecommendations(
  organizationId: string,
  input: GenerateRecommendationsInput,
): Promise<Recommendation[]> {
  const fresh = generateRecommendations(input);
  return recommendationRepository.reconcileRecommendations(organizationId, fresh);
}

/** Whatever was last reconciled, without recomputing — for read-only
 * views that don't have the full GenerateRecommendationsInput at hand. */
export async function listRecommendations(organizationId: string): Promise<Recommendation[]> {
  return recommendationRepository.listRecommendations(organizationId);
}

export async function dismissRecommendation(
  organizationId: string,
  id: string,
): Promise<void> {
  return recommendationRepository.dismissRecommendation(organizationId, id);
}

export async function completeRecommendation(
  organizationId: string,
  id: string,
): Promise<void> {
  return recommendationRepository.completeRecommendation(organizationId, id);
}
