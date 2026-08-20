# 10 — 30-Day Operations Plan

## Monitoring Strategy

**Week 1 (days 1–7): heightened watch**
- Primary on-call actively watches Sentry error rate, `/api/health`, and the admin observability console (`app/(admin)/observability`) at least twice daily.
- Daily check of Inngest dead-letter queue — a job silently failing under real (if beta-limited) traffic is the most likely early failure mode given the job platform is newer than the rest of the stack.
- Daily check of PostHog for anomalous drop-off in the sign-up → connect → dashboard funnel (signals a UX or reliability issue, not just a backend one).

**Weeks 2–4: steady-state watch**
- Move to the standard alert-driven model: Sentry/health-check alerts page on-call; no more manual daily checks required once a week of clean signal has passed.
- Weekly review of p95 latency trends (API, jobs, DB) against the baselines captured in [05](./05-performance-verification-report.md) — catch slow regressions before they become incidents.

## Bug Triage Process

1. Bug reported (via in-app feedback mechanism from [08](./08-launch-checklist.md), support email, or Sentry auto-capture).
2. Triage within 1 business day: severity classification —
   - **P0**: data loss, security exposure, or total outage → immediate, follows [06](./06-operational-runbook.md) incident process, fix ships same-day outside normal cadence.
   - **P1**: broken core flow for a subset of users (e.g., one OAuth provider failing) → fixed within the current or next release cycle.
   - **P2**: cosmetic, edge-case, or low-traffic-path issue → scheduled into a normal weekly release.
3. Every P0/P1 gets a linked incident summary if it involved user-visible downtime, per the incident response process in [06](./06-operational-runbook.md).

## Weekly Release Cadence

- Standard release: every week, batching P2 fixes and any planned fast-follow work (e.g., real provider sync rollout, expanded PostHog event coverage).
- Every release goes through the same CI/CD gates as launch — no exceptions, no hotfix bypass of `ci.yml` except for a declared P0 incident, and even then the fix still runs through CI before merge, just on an expedited human-review timeline.
- Use Rolling Releases (canary traffic split) for any release containing a schema migration, per [02](./02-deployment-architecture.md).

## Incident Workflow

Reuses [06 — Operational Runbook](./06-operational-runbook.md) directly: declare → communicate → mitigate → post-incident summary within 48 hours. Track incident count/severity monthly; more than 2 P0s in a rolling 30-day window should trigger a dedicated reliability-focused sprint rather than continuing normal feature/fast-follow cadence.

## Feature Rollout Strategy

- The provider-sync scope decision from [08](./08-launch-checklist.md)/[09](./09-go-live-approval-report.md) is the first major rollout candidate post-launch: ship real Gmail sync first (single provider, per `docs/provider-integration/` design docs), behind the feature flag, to a small cohort before expanding to Outlook/Yahoo/OCR/Account Aggregator.
- Any new feature affecting the golden path ships behind a flag first, observed for 48–72 hours at partial rollout, then expanded to 100%.
- No flag framework exists yet beyond an env-var kill switch (per [01](./01-production-readiness-report.md)) — if rollout cadence post-launch needs finer-grained (per-user, per-org, percentage) targeting, that's the trigger to build a real feature-flag service/table rather than continuing to overload env vars. Don't build it preemptively; build it when the first real need appears.

## User Feedback Loops

- In-app feedback mechanism (from [08](./08-launch-checklist.md)) feeds directly into the bug triage process above.
- PostHog funnel/event data reviewed weekly to catch friction points not reported explicitly (e.g., users abandoning at the connection step).
- Establish a lightweight monthly summary (bugs fixed, features shipped, incidents, key metrics) — useful both for internal tracking and as the seed of user-facing changelog/release notes if/when that's warranted.

## Success Criteria for the 30-Day Mark

- [ ] Zero unresolved P0 incidents
- [ ] At least 3 weekly releases shipped through the full CI/CD pipeline without a rollback
- [ ] Dead-letter queue rate stable or trending down
- [ ] Core Web Vitals and API latency within the baselines from [05](./05-performance-verification-report.md), no undiagnosed regression
- [ ] Provider sync scope decision resolved one way or the other (either real sync shipped for at least one provider, or the mock-data labeling is confirmed clear and not misleading users)
