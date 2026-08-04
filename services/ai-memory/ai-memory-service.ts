/**
 * AI Memory Service — thin pass-through to repositories/ai-memory-repository.ts,
 * the async Postgres-backed successor to lib/ai/memory.ts.
 */
import * as aiMemoryRepository from "@/repositories/ai-memory-repository";
import type { MemoryEntry } from "@/repositories/ai-memory-repository";

export async function learnCategory(
  organizationId: string,
  note: string,
  category: string,
): Promise<void> {
  return aiMemoryRepository.learnCategory(organizationId, note, category);
}

export async function findRememberedCategory(
  organizationId: string,
  note: string,
): Promise<string | null> {
  return aiMemoryRepository.findRememberedCategory(organizationId, note);
}

export async function getMemoryEntries(organizationId: string): Promise<MemoryEntry[]> {
  return aiMemoryRepository.getMemoryEntries(organizationId);
}

export async function forgetCategory(organizationId: string, key: string): Promise<void> {
  return aiMemoryRepository.forgetCategory(organizationId, key);
}

export async function clearMemory(organizationId: string): Promise<void> {
  return aiMemoryRepository.clearMemory(organizationId);
}
