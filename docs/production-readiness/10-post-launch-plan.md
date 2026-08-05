# 10. 30-Day Post-Launch Plan

## 10.1 Progressive rollout

Given the connector layer (Gmail/Graph/Yahoo/aggregator/OCR) is the newest and least-battle-tested part of the system once Phase 3 ([07](./07-production-readiness-report.md)) lands, rollout should be gated by feature flags rather than opened to 100% of traffic on day one.

| Days | Rollout | Gate to advance |
|---|---|---|
| 1-3 | Internal team + design partners only (waitlist users explicitly invited) | Zero critical Sentry errors, `/api/health` green continuously, at least 10 real successful email syncs observed |
| 4-7 | 10% of new signups | Error rate within baseline, sync success rate ≥ 95%, no security incidents |
| 8-14 | 50% of new signups | Same gates held for a full week; review week-1 support ticket themes |
| 15-21 | 100% of new signups | — |
| 22-30 | Monitor steady-state, address week-1/2 findings | Formal 30-day readiness retro |

A feature-flag system does not exist in the codebase today ([05 — Launch Checklist](./05-launch-checklist.md#accessibility) area confirms no feature-flag infra was found). Stand up a lightweight flag mechanism (a `FeatureFlag` table + admin toggle, or a managed service like a Vercel Edge Config-backed flag set) as part of Phase 0/1 — this rollout plan depends on it existing, not on manually editing env vars per deploy.

## 10.2 Monitoring strategy

- **First 72 hours**: active watch, not passive dashboards. Sentry alert thresholds tuned to page on-call for any new error type (not just volume spikes) during this window, then relaxed to steady-state thresholds after.
- **Ongoing**: `/api/health` polled by an external uptime monitor (not just internally) so an outage is detected even if the app itself can't report on its own failure.
- **Sync health**: dashboard (or PostHog funnel) tracking sync success/failure rate per provider (Gmail/Graph/Yahoo/aggregator) daily — this is the metric most likely to silently regress if a provider changes their API without notice.
- **Cost monitoring**: Neon compute, Upstash requests, R2 storage/egress, Inngest step-runs, and AI provider token spend all scale with real usage in ways mock data never exercised — set budget alerts on each in the first week, not after a surprise bill.

## 10.3 Incident response

- Define an on-call rotation (even if informal/single-person at this stage) before launch, not after the first incident.
- Severity levels: SEV1 (data loss/security breach/full outage) pages immediately; SEV2 (degraded sync, partial outage) gets same-business-day response; SEV3 (cosmetic/non-blocking) goes into the normal backlog.
- Every SEV1/SEV2 gets a written postmortem within 5 business days — given how much of this launch's risk concentrates in newly-wired subsystems ([06 — Risk Assessment §6.2](./06-risk-assessment.md#62-risk-concentration)), the first 30 days should expect a higher-than-steady-state incident rate in exactly those areas (background jobs, connectors), and postmortems there are how the team learns fast rather than repeatedly re-discovering the same class of bug.
- Rollback authority and procedure: see [09 — Go-Live Plan §9.3](./09-go-live-plan.md#93-rollback-procedures).

## 10.4 Feature flag strategy

Beyond rollout gating (§10.1), flags should wrap:
- Each connector independently (Gmail sync, Graph sync, Yahoo sync, account aggregator, OCR) — so a single provider's failure or API change can be killed without taking down the others
- AI Coach, if its cost or reliability under real load is uncertain
- Any new UI surface tied to real-connector data, so it can degrade gracefully to a "reconnect" or "coming soon" state instead of showing broken/empty data if a connector is disabled

## 10.5 Support workflow

- Define the intake channel (email, in-app widget, or ticketing tool) before launch — not specified elsewhere in this document set because it's a product/ops decision, but it must exist by day one.
- Route connector-specific complaints ("my Gmail isn't syncing") to a triage path that checks `/api/health` + Sentry + the sync-success dashboard (§10.2) before assuming user error — the newness of these integrations means "it's probably our bug" should be the default first hypothesis for the first several weeks.
- Track the first 30 days' support ticket themes explicitly; feed recurring issues back into the [Launch Checklist](./05-launch-checklist.md) as fast-follow items rather than one-off fixes, so the punch list stays the single source of truth for what's outstanding.

## 10.6 30-day retrospective

At day 30, revisit every 🔴/🟡 item in the [Production Readiness Report scorecard](./07-production-readiness-report.md#71-readiness-scorecard) against what actually happened in production: which predicted risks materialized ([06 — Risk Assessment](./06-risk-assessment.md)), which didn't, and what wasn't anticipated at all. Update this document set based on real evidence rather than treating it as a one-time artifact — production readiness is a standing practice, not a milestone that's "done" after launch day.
