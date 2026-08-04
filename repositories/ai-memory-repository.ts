/**
 * AI Memory Repository — Postgres-backed persistence for lib/ai/memory.ts's
 * successor. Durable long-term memory the Coach/classifier reason over —
 * not cache-shaped (unlike lib/coach/cache.ts/lib/query/history.ts, which
 * are genuinely ephemeral and belong in Redis instead, per the migration
 * plan §3) — so this stays in Postgres via the real AIMemoryEntry model.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/src/generated/prisma/client";

export interface MemoryEntry {
  key: string;
  note: string;
  category: string;
}

interface MemoryValue {
  note: string;
  category: string;
}

function normalizeNoteKey(note: string): string {
  return note.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function learnCategory(
  organizationId: string,
  note: string,
  category: string,
): Promise<void> {
  const key = normalizeNoteKey(note);
  if (!key) return;
  const value: MemoryValue = { note: note.trim().replace(/\s+/g, " "), category };
  await prisma.aIMemoryEntry.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
}

export async function findRememberedCategory(
  organizationId: string,
  note: string,
): Promise<string | null> {
  const key = normalizeNoteKey(note);
  if (!key) return null;
  const row = await prisma.aIMemoryEntry.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!row) return null;
  return (row.value as unknown as MemoryValue).category;
}

export async function getMemoryEntries(organizationId: string): Promise<MemoryEntry[]> {
  const rows = await prisma.aIMemoryEntry.findMany({ where: { organizationId } });
  return rows
    .map((row) => {
      const value = row.value as unknown as MemoryValue;
      return { key: row.key, note: value.note, category: value.category };
    })
    .sort((a, b) => a.note.localeCompare(b.note));
}

export async function forgetCategory(organizationId: string, key: string): Promise<void> {
  await prisma.aIMemoryEntry.deleteMany({ where: { organizationId, key } });
}

export async function clearMemory(organizationId: string): Promise<void> {
  await prisma.aIMemoryEntry.deleteMany({ where: { organizationId } });
}
