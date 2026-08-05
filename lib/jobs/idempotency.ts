/**
 * Idempotency helpers — the "layer 1" broker-level dedup keys described in
 * docs/job-platform/04-queue-strategy.md §4.6 and the per-model design in
 * docs/job-platform/07-idempotency-design.md. This module only builds
 * deterministic keys; the "layer 2" database-level guarantee (unique
 * constraints, upserts) lives in each services/* function unchanged —
 * this module never substitutes for that.
 */

/** Joins parts into a single deterministic id, e.g. buildKey("sync-start",
 * organizationId, providerId) -> "sync-start:org_123:gmail". Used both as
 * the Inngest event `id` (broker-level dedup, docs §4.6) and, where noted,
 * as a function's `idempotency` config expression target. */
export function buildKey(...parts: (string | number | undefined | null)[]): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");
}

/** Truncates a date to a UTC day boundary — the pattern
 * ForecastSnapshot.[organizationId, generatedAt] relies on (docs/job-platform/
 * 07-idempotency-design.md's Forecast Snapshots section): a job re-run
 * within the same day upserts the same row instead of creating a second
 * snapshot for that day. */
export function dayBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Truncates a date to its UTC hour boundary — used for connection-validate's
 * hourly dedup key (docs/job-platform/02-event-catalog.md). */
export function hourBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/** Truncates a date to its UTC half-hour boundary — used for
 * plugin-health-check's 30-minute dedup key. */
export function halfHourBucket(date: Date = new Date()): string {
  const half = date.getUTCMinutes() < 30 ? "00" : "30";
  return `${hourBucket(date)}:${half}`;
}
