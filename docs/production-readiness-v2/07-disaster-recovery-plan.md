# 07 — Disaster Recovery Plan

## Current State

No DR plan exists. No backup restore has ever been tested. This is a launch blocker per [01](./01-production-readiness-report.md) — for a fintech-adjacent app, "we've never actually restored a backup" is not an acceptable answer if asked during a real incident.

## Database Recovery — Neon PostgreSQL

Neon provides **point-in-time recovery (PITR)**, also called "Instant restore," via its branching model: any *root* branch can be restored "as of" a specific timestamp within the retention window, giving instant, non-destructive recovery without a traditional restore-from-snapshot process. PITR is enabled by default — there's nothing to turn on — but the retention window is plan-dependent and must be checked explicitly:

| Plan | Default window | Maximum window |
|---|---|---|
| Free | 6 hours | 6 hours (capped at 1 GB of history) |
| Launch | 1 day | 7 days |
| Scale | 1 day | 30 days |

Check/set the actual window in the Neon Console under **Settings → Instant restore** — it applies project-wide, to every branch. Only *root* branches (production's `main`) support restore; child/preview branches don't carry their own history and aren't billed for instant-restore storage.

**Procedure:**
1. Identify the target recovery timestamp (just before the corrupting event/bad migration/bad deploy).
2. In the Neon console (or via API/CLI), create a new branch from `main` "as of" that timestamp.
3. Verify data integrity on the new branch (spot-check the affected tables/rows).
4. Point `DATABASE_URL`/`DIRECT_DATABASE_URL` at the recovered branch (via Vercel env var update) — this is a config change, not a data copy, so it's fast.
5. Once confirmed stable, either promote the recovered branch to be the new `main`, or keep `main` as-is and cherry-pick the specific corrupted rows from the recovered branch back into production via a targeted script — choose based on blast radius (whole-DB corruption vs. one bad write).
6. Redeploy application if any code assumed the old branch's connection details were cached anywhere (shouldn't be the case with the current pooled-URL setup, but verify).

**RPO (Recovery Point Objective): as low as Neon's PITR granularity allows** — effectively continuous (WAL-based), so RPO is near-zero for anything within the retention window, and total loss for anything older than the retention window.

**RTO (Recovery Time Objective): target < 30 minutes** — branch creation is near-instant; most of the time is verification (step 3) and env var propagation (step 4, a Vercel redeploy takes ~1–2 minutes).

**Action required before launch**: confirm which plan the project is on and what the Instant Restore window is actually set to (Settings → Instant restore) — the *default* on Launch/Scale is only 1 day, well short of the 7/30-day maximum those plans allow, so this is a setting to explicitly raise, not just verify. If the team could plausibly not notice a data issue for longer than the current window, extend it before launch. Execute this procedure once, end-to-end, in a non-production Neon branch as a rehearsal, and record the actual time taken here.

**Getting connection strings** (Neon CLI, `neonctl`, installed 2026-08-06): after `neonctl auth` (interactive browser login), pull each branch's connection string directly instead of copy-pasting from the console:
```
neonctl connection-string main                # production, unpooled by default — for DIRECT_DATABASE_URL / migrate deploy
neonctl connection-string main --pooled       # production, pooled — for DATABASE_URL (runtime)
neonctl connection-string <preview-branch>            # preview branch, unpooled — PREVIEW_DIRECT_DATABASE_URL
neonctl connection-string <preview-branch> --pooled   # preview branch, pooled — PREVIEW_DATABASE_URL
```
`--project-id` is only needed if the account has more than one Neon project; the CLI otherwise resolves it from context or prompts.

## Storage Recovery — Cloudflare R2

R2 does not have Neon-style branching/PITR. Recovery options:
1. **Versioning** (if enabled on the bucket) — restore a prior object version directly. **Action: verify bucket versioning is enabled before launch**; if not, enable it now, since it's the only practical per-object recovery mechanism.
2. **Cross-region/backup bucket replication** — not currently configured. For launch, given documents are user-uploaded (not system-critical infrastructure state), the risk tolerance for total bucket loss is lower priority than DB loss, but still worth a periodic export job as a fast-follow (e.g., a scheduled Inngest job that syncs to a secondary bucket weekly).
3. **RPO/RTO**: with versioning enabled, RPO = 0 for accidental overwrite/delete of a known object; RTO = minutes (manual restore via R2 API/console). Without versioning, RPO/RTO = undefined (unrecoverable) — this is why enabling versioning is a launch blocker, not optional.

## Configuration Recovery

All configuration (env vars, `vercel.ts`, security headers, feature flags) lives in version control (this repo) or Vercel's environment variable store.
1. **Repo-tracked config**: recovered by definition — it's in git history, redeploy from any prior commit is always possible.
2. **Vercel env vars**: not version-controlled by default. **Action**: after Phase 1–4 land, run `vercel env pull` and commit an encrypted/redacted snapshot (or at minimum, maintain a documented list of every var and *where its value can be regenerated from* — e.g., "Neon dashboard → connection string", "Upstash dashboard → REST token") so a full Vercel project loss is recoverable without guessing what was set.

## Full Environment Recovery (worst case: Vercel project deleted/corrupted)

1. Re-link the repo to a new Vercel project (`vercel link`).
2. Re-populate env vars from the documented source list above.
3. Re-run `deploy-production.yml` manually.
4. Re-point DNS at the new project's assigned records.
5. Neon/Upstash/R2/Inngest/Sentry/PostHog projects are independent of Vercel and unaffected by this scenario — only the Vercel project itself and its env var store are at risk here.

**RTO for this scenario: target < 2 hours**, dominated by DNS propagation, not by any of the technical recovery steps.

## Summary Table

| Component | Mechanism | RPO | RTO | Tested? |
|---|---|---|---|---|
| Database (Neon) | PITR branch-as-of-timestamp | Near-zero (within retention window) | < 30 min | ❌ Not yet — required before launch |
| Storage (R2) | Bucket versioning | 0 (per-object, if enabled) | Minutes | ❌ Not yet — enable versioning + test |
| Config (repo) | Git history | 0 | Minutes | N/A (always available) |
| Config (Vercel env vars) | Documented source list | N/A (regenerable) | Depends on source | ❌ Not yet — write the source list |
| Full Vercel project | Re-link + re-populate | N/A | < 2 hours | ❌ Not yet |

## Success Criteria

- [ ] Neon PITR retention window confirmed adequate, one full restore rehearsed and timed
- [ ] R2 bucket versioning confirmed enabled, one object restore rehearsed
- [ ] Vercel env var source-of-truth list written and stored somewhere durable outside Vercel itself
- [ ] This document's RTO/RPO figures updated with actual measured values, not just targets, after the rehearsal

## Timeline

2–3 days, including the required hands-on rehearsal (cannot be shortcut — an untested restore procedure is not a restore procedure).
