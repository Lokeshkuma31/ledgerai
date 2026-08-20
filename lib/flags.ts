/**
 * Minimal env-var-driven feature flags — the launch-blocking minimum from
 * docs/production-readiness-v2/08-launch-checklist.md's "Feature Flags /
 * Rollout Safety" section. Not a full flag service (per-user/percentage
 * targeting) — build that only when a real rollout need appears, per
 * docs/production-readiness-v2/10-30-day-operations-plan.md.
 *
 * NEXT_PUBLIC_-prefixed so the same predicate works in both server code
 * (Inngest job functions) and client components (SyncDashboard,
 * ManualSyncButton) without duplicating the flag under two names.
 */

/**
 * Provider data sync (Gmail/Outlook/Yahoo/OCR/Account Aggregator) currently
 * returns mock/fixture data behind real OAuth — see
 * docs/provider-integration/README.md. This flag is the kill switch called
 * for in docs/production-readiness-v2/01-production-readiness-report.md so
 * sync can be disabled instantly (no redeploy) if the launch-scope decision
 * is "flag it off" rather than "ship clearly-labeled demo data."
 *
 * Defaults to enabled — flipping NEXT_PUBLIC_PROVIDER_SYNC_ENABLED="false"
 * in the environment is the explicit opt-out.
 */
export function isProviderSyncEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PROVIDER_SYNC_ENABLED !== "false";
}
