# Frontend Integration Plan — Connecting LedgerAI to Production Persistence

**Scope discipline:** this is a migration only. No new features, no UI redesign, no new business logic. The goal is byte-for-byte behavioral parity — every page, button, and empty state works exactly as it does today — with PostgreSQL (via `repositories/*` + `services/*`) as the source of truth instead of `localStorage`. UI/UX, copy, and interaction design are out of scope and untouched.

**Status as of this plan:** the backend (Prisma schema, `repositories/*`, `services/*`, Redis, R2, Better Auth) is built and integration-tested against a real Postgres database — see `you-are-a-principal-floating-conway.md` for that work. **None of it is wired to the UI yet.** Every page still reads/writes `localStorage` through the original `lib/*` modules. This plan is the second half of the migration: connecting the two.

---

## PART 1 — AUDIT

### 1.1 Page inventory

Every path in `middleware.ts`'s `PROTECTED_PATHS` has a `page.tsx`. All 28 are Server Components whose only server-side data fetching today is session/connection lookups (already Postgres-backed via `lib/connections/registry.ts`); every page immediately hands off to a `"use client"` top-level component that does the real data fetching from `localStorage`.

| Route | Page file | Top-level client component(s) |
|---|---|---|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | `DashboardLayout` → `dashboard/DashboardOverview` |
| `/transactions` | `.../transactions/page.tsx` | `TransactionsTable` |
| `/transactions/[id]` | `.../transactions/[id]/page.tsx` | `TransactionDetail` |
| `/budgets` | `.../budgets/page.tsx` | `budgets/BudgetsPageContent` |
| `/goals` | `.../goals/page.tsx` | `GoalsOverview` |
| `/forecast` | `.../forecast/page.tsx` | `forecast/ForecastPageContent` → `ScenarioSimulator` |
| `/insights` | `.../insights/page.tsx` | `insights/InsightsPageContent` |
| `/merchants` | `.../merchants/page.tsx` | `MerchantStatistics`, `MerchantDirectory` |
| `/merchants/[id]` | `.../merchants/[id]/page.tsx` | `MerchantProfile` |
| `/recurring` | `.../recurring/page.tsx` | `RecurringOverview` |
| `/feed` | `.../feed/page.tsx` | `feed/FeedPageContent` |
| `/search` | `.../search/page.tsx` | `SearchOverview` |
| `/ai-coach` | `.../ai-coach/page.tsx` | `aicoach/AiCoachPageContent` |
| `/analytics` | `.../analytics/page.tsx` | `analytics/AnalyticsPageContent` |
| `/banks` | `.../banks/page.tsx` | `DataSourceStatusStrip`, `BankDashboard` |
| `/documents` | `.../documents/page.tsx` | `DataSourceStatusStrip`, `DocumentIntelligenceDashboard` |
| `/email` | `.../email/page.tsx` | `DataSourceStatusStrip`, `EmailDashboard` |
| `/sync` | `.../sync/page.tsx` | `DataSourceStatusStrip`, `SyncDashboard` |
| `/workflows` | `.../workflows/page.tsx` | `WorkflowsOverview` |
| `/plugins` | `.../plugins/page.tsx` | `PluginSettings` |
| `/plugins/account-aggregator` | `.../plugins/account-aggregator/page.tsx` | `AccountAggregatorDashboard` |
| `/plugins/android-sms` | `.../plugins/android-sms/page.tsx` | `SMSImportPage` |
| `/connections` | `.../connections/page.tsx` | `DataSourceStatusStrip`, `ConnectionHub` (**already Postgres-backed**) |
| `/settings` | `.../settings/page.tsx` | `settings/SettingsShell` (tabs below) |
| `/settings/import` | `.../settings/import/page.tsx` | `ImportHistoryList` |
| `/settings/memory` | `.../settings/memory/page.tsx` | `MemoryManager` |
| `/settings/notifications` | `.../settings/notifications/page.tsx` | `NotificationSettings` |
| `/settings/sources` | `.../settings/sources/page.tsx` | `SourceSettings` |

### 1.2 `localStorage` inventory — 43 keys across 37 files

| Key | Owning file | Key | Owning file |
|---|---|---|---|
| `ledgerai:transactions` | `lib/storage.ts` | `ledgerai:email:providers/records/import-runs` | `lib/email/registry.ts` |
| `ledgerai:budgets` | `lib/budget/storage.ts` | `ledgerai:sync:history` | `lib/sync/history.ts` |
| `ledgerai:goals` | `lib/goals/storage.ts` | `ledgerai:sync:schedules` | `lib/sync/scheduler.ts` |
| `ledgerai:memory` | `lib/ai/memory.ts` | `ledgerai:coach-cache` | `lib/coach/cache.ts` |
| `ledgerai:merchants` | `lib/merchant/registry.ts` | `ledgerai:pinned-insights` | `lib/coach/pinnedInsights.ts` |
| `ledgerai:merchant-knowledge` | `lib/merchant/knowledge-registry.ts` | `ledgerai:policy:candidates` | `lib/policy/registry.ts` |
| `ledgerai:recurring` (+`:overrides`) | `lib/recurring/registry.ts` | `ledgerai:policy:cooldowns` | `lib/policy/cooldown.ts` |
| `ledgerai:recommendation-status` | `lib/decision/storage.ts` | `ledgerai:policy:preferences` | `lib/policy/preferences.ts` |
| `ledgerai:feed` | `lib/feed/registry.ts` | `ledgerai:plugins:state` | `lib/plugins/registry.ts` |
| `ledgerai:explanations` | `lib/explanations/registry.ts` | `ledgerai:sources:enabled` | `lib/sources/index.ts` |
| `ledgerai:workflows` (+`:history`) | `lib/workflows/{registry,history}.ts` | `ledgerai:query-history` | `lib/query/history.ts` |
| `ledgerai:import-history` | `lib/import/history.ts` | `ledgerai:recent-searches` +`:search-term-counts`+`:search-total-count` | `lib/index/registry.ts` |
| `ledgerai:analytics-filters` | `lib/visualization/filterPreferences.ts` | `ledgerai:plugins:document-intelligence:documents` | `plugins/document-intelligence/registry.ts` |
| `ledgerai:analytics-cache:*` (unused today) | `lib/visualization/cache.ts` | `ledgerai:plugins:account-aggregator:consent(+-history)` | `plugins/account-aggregator/consent.ts` |
| `ledgerai:banks:state/accounts` | `lib/banks/registry.ts` | `ledgerai:plugins:android-sms:settings/imported/stats/summary` | `plugins/android-sms/plugin.ts` |
| `ledgerai:banks:sync-history/fingerprints/transaction-links` | `lib/banks/sync-engine.ts` | | |
| `ledgerai:banks:schedule` | `lib/banks/scheduler.ts` | | |

`sessionStorage`: **zero usages anywhere in the codebase** — nothing to migrate there.

### 1.3 Mock services

| Mock file | Consumed via | Surfaces in |
|---|---|---|
| `plugins/account-aggregator/mock-provider.ts` | `auth.ts`, `connector.ts`, `consent.ts` | `AccountAggregatorDashboard`, `BankDashboard` |
| `plugins/gmail/mock-provider.ts` | `plugins/gmail/plugin.ts` → `lib/email/provider.ts` | `EmailDashboard` |
| `plugins/document-intelligence/mock-documents.ts` | `plugins/document-intelligence/ocr.ts` (`MockOCRProvider`) | `DocumentIntelligenceDashboard` |
| `plugins/android-sms/mock-data.ts` | `plugins/android-sms/plugin.ts` | `SMSImportPage` |

**These stay mocked.** Per the backend migration's own decoupling decision, replacing the mock Gmail/Account Aggregator/SMS/OCR *providers* with real external integrations is explicitly out of scope for this pass — only their *persistence* moves to Postgres (documents/emails already have real repositories; the upstream fixture data is untouched).

### 1.4 Client-side state management

| Provider | File | Holds | Backing |
|---|---|---|---|
| `DashboardContext` (`useDashboard`) | `components/DashboardProvider.tsx` | `{ state: FinancialState \| null, isLoading, refresh }` | **Wraps localStorage** — `refresh()` reads `getTransactions/getBudgets/getMemoryEntries` then fans out through `lib/intelligence/orchestrator.ts` across ~15 engines |
| `ChartContext` | `components/ui/chart.tsx` | Chart color/label config | Pure UI state — **not in scope** |
| `SidebarContext` | `components/ui/sidebar.tsx` | Collapsed/expanded state | Persisted via a cookie, not localStorage — **not in scope** |

**Critical finding:** `DashboardProvider` wraps *every* `(app)` route (mounted once in `app/(app)/layout.tsx`), but roughly two-thirds of top-level components — `BankDashboard`, `AccountAggregatorDashboard`, `DocumentIntelligenceDashboard`, `EmailDashboard`, `SyncDashboard`, `GoalsOverview`, `MerchantDirectory`, `MerchantStatistics`, `MerchantProfile`, `PluginSettings`, `SMSImportPage`, `RecurringOverview`, `SearchOverview`, `WorkflowsOverview`, `ImportHistoryList`, `MemoryManager`, `NotificationSettings`, `SourceSettings`, `DataSourceStatusStrip`, plus parts of `TransactionsTable`, `AiCoachPageContent`, `AnalyticsPageContent` — **bypass the context and read `localStorage` directly**, several rebuilding their own mini `FinancialState` from scratch (`GoalsOverview`, `MerchantProfile`, `WorkflowsOverview` each independently call `generateForecast`/`generateInsights`/`generateTimeline`/`detectRecurringTransactions` against a fresh `getTransactions()`). **Migrating `DashboardProvider` alone does not migrate these pages** — each needs its own React Query wiring, which is exactly why Part 3 is organized by domain, not by "fix the one context."

---

## PART 2 — API MAPPING

### 2.1 What already exists

| Layer | Status |
|---|---|
| `repositories/*.ts` (18 files) | Done — one per domain, Postgres via Prisma |
| `services/*/*.ts` (18 directories) | Done — Zod-validated business logic wrapping the repositories |
| Route Handlers | **Only 3 exist**: `app/api/auth/[...all]/route.ts` (Better Auth), `app/api/connections/[provider]/{authorize,callback}/route.ts`, `app/api/documents/upload/route.ts`, plus the new `app/api/me/route.ts` (Part 4) |
| Server Actions | Only `lib/connections/actions.ts` |
| React Query | Installed, now wired (`QueryProvider` in `app/layout.tsx` as of Part 4) — zero domain hooks exist yet beyond Auth |

**The single biggest gap:** every domain's `services/*` layer is fully built and tested, but **no Route Handler exposes any of them to the browser.** This is the majority of the remaining work — not new business logic, just the HTTP boundary.

### 2.2 Domain → Route Handler → Service mapping

| Domain | Route Handlers to build | Service methods (already exist) |
|---|---|---|
| Auth | `app/api/auth/[...all]` (done), `app/api/me` (done) | `lib/auth/session.ts` |
| Transactions | `GET/POST /api/transactions`, `GET/PATCH /api/transactions/[id]`, `POST /api/transactions/bulk`, `PATCH /api/transactions/[id]/review` | `services/transactions/transaction-service.ts` |
| Merchants | `GET /api/merchants`, `GET/DELETE /api/merchants/[id]`, `POST /api/merchants`, `POST /api/merchants/merge` | `services/merchants/merchant-service.ts` |
| Budgets | `GET/POST /api/budgets`, `PATCH/DELETE /api/budgets/[id]`, `GET /api/budgets/status` | `services/budgets/budget-service.ts` |
| Goals | `GET/POST /api/goals`, `PATCH/DELETE /api/goals/[id]`, `POST /api/goals/[id]/complete` | `services/goals/goal-service.ts` |
| Recurring | `GET /api/recurring`, `POST /api/recurring/detect`, `POST /api/recurring/[id]/pause`\|`/resume` | `services/recurring/recurring-service.ts` |
| Recommendations | `GET /api/recommendations`, `POST /api/recommendations/dismiss`\|`/complete` | `services/decision/decision-service.ts` |
| Forecast | `GET /api/forecast` (computes on demand — **no repository needed**, see 2.3) | `lib/forecast/engine.ts` directly |
| Connections | Already done (`app/api/connections/*`, `lib/connections/actions.ts`) | `lib/connections/engine.ts` |
| Banks | `GET /api/banks`, `POST /api/banks/[id]/sync`, `PATCH /api/banks/[id]/enable` | `services/banks/bank-sync-service.ts` |
| Documents | `GET /api/documents`, `GET/PATCH /api/documents/[id]`, `/upload` (done), `POST /api/documents/[id]/import`\|`/skip`\|`/reject` | `services/documents/document-service.ts` |
| Email | `GET /api/emails`, `PATCH /api/emails/[id]`, `POST /api/emails/sync` | `services/email/email-import-service.ts` |
| Sync | `GET /api/sync/jobs`, `GET /api/sync/health` | `services/sync/sync-job-service.ts` |
| Workflows | `GET /api/workflows`, `PATCH /api/workflows/[key]/enable`\|`/disable`, `GET /api/workflows/runs` | `services/workflows/workflow-service.ts` |
| Feed | `GET /api/feed`, `PATCH /api/feed/[id]/read`\|`/pin`\|`/dismiss` | `services/feed/feed-service.ts` |
| Notifications | `GET/PATCH /api/notifications/preferences`, `GET /api/notifications`, `PATCH /api/notifications/[id]/override` | `services/policy/notification-service.ts` |
| AI Memory | `GET /api/memory`, `DELETE /api/memory/[key]` | `services/ai-memory/ai-memory-service.ts` |
| AI Coach | `POST /api/coach` (computes + Redis-caches) | `lib/coach/coach.ts` + `services/coach/coach-cache-service.ts` |
| Search | `GET /api/search`, `GET/POST/DELETE /api/search/history` | `lib/index/*` (compute) + `services/query/query-history-service.ts` (done) |
| Plugins | `GET /api/plugins`, `PATCH /api/plugins/[id]/enable` | `services/plugins/plugin-service.ts` |

### 2.3 Missing backend pieces (flagged, not silently worked around)

| Gap | Detail | Recommendation |
|---|---|---|
| **Explanation model** | `FeedItem.explanationId`/`lib/explanations/registry.ts` have no Postgres model (flagged during backend migration, still unresolved) | Resolve before migrating Insights/Feed/Budgets' "Why?" buttons — either add a real `Explanation` model or fold into `metadata` JSON. Needs a decision, not a default. |
| **Import history** (`lib/import/history.ts`) | No repository built | Small — same shape as `sync-job-repository.ts`; can reuse `SyncJob` (category `OTHER`) rather than a new table |
| **Source enabled state** (`lib/sources/index.ts`) | No repository built | Small — fold into a new `organization_source_preferences` row or extend `NotificationPreferences`-style singleton |
| **Search history** (`lib/index/registry.ts` — recent searches, term counts) | Not migrated (only Query History and Coach cache were) | Same Redis pattern as `query-history-service.ts`; add during the Search domain |
| **Forecast/Insights/Timeline/Events/Attention engines** | No repository — **by design**, these are pure computed-on-read functions, never persisted (matches `ForecastSnapshot` being periodic-snapshot-only per the original architecture) | Route Handlers call the `lib/*` engine functions directly against already-migrated Transaction/Budget/Recurring data; no new repository work |
| **Dashboard aggregate endpoint** | None planned | Deliberately **not** building one — see 3.2, Dashboard composes per-domain hooks instead of one monolithic endpoint |

### 2.4 Data relationships that constrain migration order

- **Everything reads Transactions.** Budgets, Goals, Recurring, Forecast, Insights, Timeline, Events, Recommendations, Feed, Search, Coach all compute from the transaction set — Transactions must be the first domain migrated after Auth/Dashboard-shell.
- **Merchants feed Recurring, Coach, Search, MerchantProfile.** Must land before those.
- **Feed/Recommendations/Policy feed the Dashboard's attention surface and Notifications.** Should land after their upstream engines (Budget, Recurring, Events) but before Notifications.
- **Documents/Email feed Transactions** (imported transactions link back via `DocumentTransaction`) — sequence them after Transactions so the link target exists.
- **Search and Coach are the most downstream** — they read nearly everything, so they're last for a reason: migrating them earlier just means re-testing them repeatedly as upstream domains change underneath.

---

## PART 3 — MIGRATION PLAN

### 3.1 Implementation order — confirmed, with one clarification

The requested order is sound and matches the dependency graph in 2.4, **with one caveat worth stating explicitly**: "Dashboard" (position 2) is the aggregator of nearly everything else. It can't be *fully* wired until Transactions/Budgets/Merchants/Recurring land later in the sequence. Position 2 should be read as: **build the Dashboard's shell, layout, auth-gated routing, and the `useDashboardData` composition hook's structure now; populate each widget's real query as its domain is migrated later.** This avoids a big-bang rewrite of `DashboardProvider` and lets the Dashboard page render correctly (with loading/empty states) throughout the migration rather than only at the very end.

The user's 13 named domains don't explicitly cover every page found in the audit. The following are folded into the nearest named domain rather than treated as unlisted extras:

- **Goals** → alongside Budgets (shares `calculateBudgetStatus`, same page family)
- **Insights, Feed, Analytics** → alongside Dashboard (all are `FinancialState` consumers/producers)
- **AI Coach** → alongside Search (both are the most-downstream, read-everything domains)
- **Workflows, Plugins, Sync, Banks** → alongside Connections (all are "data source / automation" pages, same `DataSourceStatusStrip` family)

Confirmed order: **Authentication → Dashboard (shell) → Transactions → Merchants → Budgets & Goals → Recurring → Forecast, Insights, Timeline, Events (+ Dashboard widgets) → Connections, Banks, Sync, Workflows, Plugins → Documents → Emails → Notifications & Feed → Search & AI Coach → Settings.**

---

### 3.2 Authentication — **done, see Part 4**

Reference implementation. Every subsequent domain follows this exact shape: `lib/react-query/keys.ts` namespace → hooks in `hooks/<domain>/` → Route Handlers → existing `services/<domain>/*`.

---

### 3.3 Dashboard

- **Pages:** `/dashboard`
- **Storage removed:** `DashboardProvider`'s direct `getTransactions/getBudgets/getMemoryEntries` calls and its `buildFinancialState` fan-out (incrementally, as each source domain migrates)
- **React Query:** `useDashboardData(organizationId)` — **not** one query; a composition of `useTransactions`, `useBudgetStatuses`, `useRecurringSummary`, `useRecommendations`, `useFeed` etc. (each domain's own hook, `useQueries` for parallel fetch). `staleTime` 30s, `refetchOnWindowFocus: true` (dashboard is glance-and-leave). No dedicated Route Handler — this domain has no CRUD of its own.
- **CRUD:** none (read-only aggregation)
- **Zod:** none new (each source domain's schema applies)
- **Errors:** partial-failure tolerant — one widget's query failing (e.g. Recurring) must not blank the whole dashboard; each widget renders its own `ErrorState`
- **Loading/empty:** per-widget skeletons (not one full-page skeleton); empty state per widget ("No transactions yet — add your first expense")
- **Optimistic updates:** none at this layer (delegated to source domains)
- **Testing:** widget-level render tests with one source query mocked to error, confirming the other widgets still render

---

### 3.4 Transactions

- **Pages:** `/transactions`, `/transactions/[id]`, plus `AddExpenseDialog`, `ImportDialog`
- **Storage removed:** `lib/storage.ts` (`getTransactions`, `addTransaction(s)`, `reviewTransaction`, `reassignMerchant`, `clearMerchantFromTransactions`) — all 43 call sites across `TransactionsTable`, `TransactionDetail`, `ManualSource.ts`, `CSVSource.ts`
- **React Query:**
  - `useTransactions(organizationId, filters?)` — paginated/infinite query (`useInfiniteQuery`, cursor on `date`+`id`), `staleTime` 30s
  - `useTransaction(id)` — `staleTime` 60s
  - `useCreateTransaction()`, `useBulkCreateTransactions()`, `useReviewTransaction()` — mutations, invalidate `transactions.all` + `budgets.status` (spend changed) + `dashboard`
- **CRUD:** Create (manual + CSV bulk), Read (list + detail), Update (review/recategorize), no hard delete (matches existing UI — no delete button found)
- **Zod:** reuse `services/transactions/transaction-schema.ts`'s `transactionInputSchema` directly in the Route Handler — this is the "share schemas" requirement in practice
- **Errors:** 422 on invalid amount/date (existing `lib/ingestion/pipeline.ts` validation, now surfaced via the API instead of a thrown client-side error); 404 on review-of-nonexistent-id
- **Loading/empty:** table skeleton rows; empty state "No transactions — add one manually or import a CSV" (existing copy, verify against current `TransactionsTable` empty branch before wiring)
- **Optimistic updates:** `reviewTransaction` — optimistically flip `reviewed: true` in the cache, roll back on error (the classic checkbox-toggle case)
- **Testing:** list pagination, review mutation success + rollback-on-500, CSV bulk import, category reassignment cascading into the merchant/budget caches being invalidated

---

### 3.5 Merchants

- **Pages:** `/merchants`, `/merchants/[id]`
- **Storage removed:** `lib/merchant/registry.ts`, `lib/merchant/knowledge.ts` (`getAllMerchants`, `getAllMerchantProfiles`, `getMerchantProfile`, `deleteMerchant`, `mergeMerchant`)
- **React Query:** `useMerchants(organizationId)`, `useMerchantProfile(id)`, `useMergeMerchant()`, `useDeleteMerchant()` — mutations invalidate `merchants.all` **and** `transactions.all` (merge/delete cascades to transaction rows per `merchant-repository.ts`'s atomic `$transaction`)
- **CRUD:** Read (list, profile), Update (merge), Delete
- **Zod:** `registerMerchantInputSchema` (already in `services/merchants/merchant-schema.ts`)
- **Errors:** 409 on merging a merchant into itself (already thrown by the service — map to a specific toast, not the generic conflict message)
- **Loading/empty:** directory skeleton grid; empty state "No merchants detected yet"
- **Optimistic updates:** none (merge/delete are destructive enough to warrant waiting for server confirmation before updating the UI)
- **Testing:** merge cascades correctly into transaction cache invalidation; delete removes from list without a stale profile page 404 flash

---

### 3.6 Budgets & Goals

- **Pages:** `/budgets`, `/goals`
- **Storage removed:** `lib/budget/storage.ts`, `lib/goals/storage.ts`
- **React Query:** `useBudgets(organizationId)`, `useBudgetStatuses(organizationId)` (joins live Transaction spend), `useAddBudget()`, `useUpdateBudgetLimit()`, `useDeleteBudget()`; `useGoals`, `useAddGoal`, `useUpdateGoal`, `useMarkGoalCompleted` — same shape
- **CRUD:** full CRUD both domains
- **Zod:** `addBudgetInputSchema`/`updateBudgetLimitInputSchema`, `goalInputSchema`/`updateGoalInputSchema` (exist)
- **Errors:** 409 "A budget for {category} already exists" (already a real service error — map directly, don't re-derive)
- **Loading/empty:** empty state "No budgets set — create one to track spending by category"; goal cards skeleton
- **Optimistic updates:** `markGoalCompleted` — optimistically set `currentAmount = targetAmount`, `status = "completed"` before the server round-trip (instant progress-bar-fills-to-100% feedback)
- **Testing:** duplicate-category 409 surfaces the right message; goal status transitions (not-started → in-progress → completed/overdue) match `deriveGoalStatus`'s existing test coverage

---

### 3.7 Recurring

- **Pages:** `/recurring`
- **Storage removed:** `lib/recurring/registry.ts` (`getAllRecurring`, `pauseRecurring`, `resumeRecurring`; detection itself already async-ready via `services/recurring/recurring-service.ts::detectAndReconcileRecurring`)
- **React Query:** `useRecurring(organizationId)`, `usePauseRecurring()`, `useResumeRecurring()`; detection triggered server-side (Inngest, once wired — see Part 4's predecessor plan) rather than client-invoked
- **CRUD:** Read, Update (pause/resume) only — no direct create/delete (detection-derived)
- **Zod:** none new (pause/resume take only an id)
- **Errors:** standard 404/500
- **Loading/empty:** empty state "No recurring transactions detected yet"
- **Optimistic updates:** pause/resume — instant status pill flip, rollback on error
- **Testing:** override survives a subsequent detection re-run (already covered server-side by `recurring-service.test.ts`; add a client test confirming the optimistic pause isn't clobbered by a background refetch mid-flight)

---

### 3.8 Forecast (+ Insights, Timeline, Events — Dashboard-adjacent widgets)

- **Pages:** `/forecast`, `/insights`, parts of `/dashboard` and `/analytics`
- **Storage removed:** direct `generateForecast`/`generateInsights`/`generateTimeline`/`detectFinancialEvents` calls in `ScenarioSimulator`, `GoalsOverview`, `MerchantProfile`, `WorkflowsOverview`, `useFinancialSearch.ts` — each currently re-derives from its own `getTransactions()`
- **React Query:** `useForecast(organizationId)`, `useInsights(organizationId)`, `useTimeline(organizationId)`, `useFinancialEvents(organizationId)` — all `GET`, computed server-side from already-migrated Transaction/Budget/Recurring data, cached client-side with a **short** `staleTime` (these are cheap to recompute but expensive to have 5 components each recompute independently — the API call itself is the dedup point)
- **CRUD:** read-only
- **Zod:** query-param schema for date-range filters only
- **Errors:** standard
- **Loading/empty:** forecast chart skeleton; empty state "Not enough transaction history to forecast yet" (existing `ForecastProjectionChart` guard, preserve verbatim)
- **Optimistic updates:** n/a (read-only)
- **Testing:** confirm the 5 independent call sites now share one cached query (network tab / mock call count assertion) instead of 5 redundant computations

---

### 3.9 Connections, Banks, Sync, Workflows, Plugins

- **Pages:** `/connections`, `/banks`, `/plugins/account-aggregator`, `/sync`, `/workflows`, `/plugins`, `/plugins/android-sms`
- **Storage removed:** `lib/banks/registry.ts`, `lib/banks/sync-engine.ts`, `lib/sync/history.ts`, `lib/sync/scheduler.ts`, `lib/workflows/{registry,history}.ts`, `lib/plugins/registry.ts`. **`lib/connections/*` is already migrated** — this domain's job is wrapping it in React Query hooks (it currently uses server-component props + Server Actions + `revalidatePath`, which still works but doesn't give the app consistent optimistic-update/cache behavior with everything else)
- **React Query:** `useConnections`, `useStartConnection`, `useDisconnect`; `useBankAccounts`, `useSyncBankAccount`; `useSyncJobs`, `useSyncHealth`; `useWorkflows`, `useEnableWorkflow`/`useDisableWorkflow`, `useWorkflowRuns`; `usePlugins`, `useTogglePlugin`
- **CRUD:** mixed — Connections/Banks are mostly read+action (sync, disconnect); Workflows/Plugins are read+toggle
- **Zod:** reuse existing service schemas; Connections already validates via `lib/connections/types.ts`
- **Errors:** connection-specific: `PERMISSION_REVOKED`/`AUTHENTICATION_FAILED` need distinct messaging from a generic 401 (the user needs to re-auth with the *provider*, not LedgerAI itself) — extend `ErrorState`'s presentation map for this domain rather than overloading `UnauthorizedError`
- **Loading/empty:** `DataSourceStatusStrip` skeleton (shared across all 4 pages); empty state "No accounts connected yet"
- **Optimistic updates:** plugin/workflow enable-disable toggles only; sync/connect actions wait for real confirmation (external side effects, can't be optimistic)
- **Testing:** the atomic merchant-merge-style transaction boundaries aren't relevant here, but sync job status transitions (queued→running→completed/failed) should be tested against the real `sync-job-repository` upsert-by-id semantics already covered server-side

---

### 3.10 Documents

- **Pages:** `/documents`
- **Storage removed:** `plugins/document-intelligence/registry.ts` (already has a Postgres repository — `document-repository.ts` — this domain is "just" wiring, no new backend logic)
- **React Query:** `useDocuments(organizationId)`, `useDocument(id)`, `useUploadDocument()` (two-step: `POST /api/documents/upload` for the presigned URL, then a direct `PUT` to R2, then `POST /api/documents` to record it), `useImportDocument()`, `useSkipDocument()`, `useRejectDocument()`
- **CRUD:** full — this is the domain with the most distinct actions (upload, process, import, skip, reject, edit fields)
- **Zod:** new schema wrapping `RecordDocumentInput` for the Route Handler layer
- **Errors:** upload-specific: file-too-large / wrong-mime-type (already validated in `app/api/documents/upload/route.ts`) needs its own toast, not the generic `ValidationError` message
- **Loading/empty:** upload progress bar (real, since R2 PUT is a real network transfer — not a skeleton); empty state "No documents uploaded yet"
- **Optimistic updates:** skip/reject — optimistic status flip; import — wait for real confirmation (creates transactions, side-effecting)
- **Testing:** duplicate detection (invoice-number-first, then fingerprint fallback) already covered server-side; add a client test that a duplicate-flagged document shows the correct warning UI before import

---

### 3.11 Email

- **Pages:** `/email`
- **Storage removed:** `lib/email/registry.ts` (repository already exists — `email-repository.ts`)
- **React Query:** `useEmails(organizationId)`, `useEditEmailFields()`, `useImportEmail()`, `useSkipEmail()`, `useRejectEmail()`, `useSyncEmailProvider()`
- **CRUD:** same shape as Documents (process/import/skip/reject/edit)
- **Zod:** wraps `EmailRecord` patch shape
- **Errors:** provider-connection errors surface the same way as Connections (3.9) — reuse that error presentation
- **Loading/empty:** empty state "No emails processed yet — connect Gmail to get started" (links to Connections)
- **Optimistic updates:** same as Documents — skip/reject optimistic, import waits
- **Testing:** duplicate detection's 3 branches (externalId, invoice-like, receipt-like-with-time-window, statement-like) — already covered server-side, add one client smoke test per branch

---

### 3.12 Notifications & Feed

- **Pages:** `/settings/notifications`, `/feed`
- **Storage removed:** `lib/policy/{registry,preferences,cooldown}.ts`, `lib/feed/registry.ts`
- **React Query:** `useNotificationCandidates`, `useNotificationPreferences`, `useUpdateNotificationPreferences`, `useOverrideDecision`, `useRestoreDecision`; `useFeed(organizationId)`, `useMarkFeedItemRead`, `usePinFeedItem`, `useDismissFeedItem`
- **CRUD:** preferences (read+update, singleton), candidates/feed (read+status-transition)
- **Zod:** preferences patch schema (partial `NotificationPreferences`)
- **Errors:** standard
- **Loading/empty:** feed empty state "You're all caught up"; notification settings has no empty state (always shows the toggle list, defaulted)
- **Optimistic updates:** read/pin/dismiss on feed items — instant UI flip, matches the existing snappy-feeling interaction; preferences save — optimistic toggle, rollback on error
- **Testing:** dismissed-then-restored feed items keep their original `createdAt` (already covered server-side by the reconcile-preserves-state tests — confirm the client doesn't refetch-and-clobber this)

---

### 3.13 Search & AI Coach

- **Pages:** `/search`, `/ai-coach`
- **Storage removed:** `lib/index/useFinancialSearch.ts`'s client-side full-index-rebuild-on-mount, `lib/index/registry.ts`'s recent-searches keys, `lib/query/{engine,history}.ts`, `lib/coach/{cache,pinnedInsights}.ts`
- **React Query:** `useSearch(query, filters)` (debounced, `enabled: query.length > 0`), `useSearchHistory` (wraps the already-built `query-history-service.ts`), `useDeleteSearchHistoryEntry`; `useCoachResponse(signature)` (wraps `coach-cache-service.ts` — cache hit is near-instant, miss triggers real computation), `usePinnedInsights`, `useTogglePinnedInsight`
- **CRUD:** search is read-only + history CRUD; Coach is read (with server-side cache) + pin toggle
- **Zod:** search query-param schema; Coach request schema (whatever context fields the engine needs)
- **Errors:** standard, plus a distinct "Coach is thinking" vs. genuine timeout distinction (Coach responses can legitimately take longer — use a longer `timeoutMs` on this one `apiClient` call, not the global default)
- **Loading/empty:** search empty state "No results for '{query}'" (existing copy); Coach shows a typing/thinking indicator, not a generic spinner
- **Optimistic updates:** pinned-insight toggle only
- **Testing:** confirm the index is built **once server-side per request**, not once per component (the audit found `useFinancialSearchIndex` currently rebuilds independently in `CommandPalette` and `SearchOverview` — after migration both should share one React Query cache entry)

---

### 3.14 Settings (composite)

- **Pages:** `/settings` + 4 sub-tabs
- **Storage removed:** `lib/import/history.ts`, `lib/ai/memory.ts` (Memory tab — already has `ai-memory-service.ts`), `lib/sources/index.ts`, plus the Notifications tab (covered in 3.12) and Connections tab (covered in 3.9)
- **React Query:** `useImportHistory`, `useMemoryEntries`, `useForgetCategory`, `useClearMemory`, `useSourcePreferences`, `useSetSourceEnabled`
- **CRUD:** mostly read + delete (forget a memory entry, view import history); sources is read+toggle
- **Zod:** minimal — these are simple settings, not complex domain objects
- **Errors:** standard
- **Loading/empty:** "No import history yet"; "LedgerAI hasn't learned any category preferences yet"
- **Optimistic updates:** source enable/disable toggle; memory-entry deletion
- **Testing:** confirm forgetting a memory entry doesn't affect already-classified transactions (matches existing `learnCategory`/`forgetCategory` semantics — forgetting only stops *future* classification)

---

## PART 4 — REFERENCE IMPLEMENTATION (Authentication)

**Status: built, not just documented.** Every file below exists in the repo and passes its tests.

### 4.1 Files added/changed

```
lib/api/errors.ts                       # AppError hierarchy (client-safe — no server imports)
lib/api/error-handler.ts                # handleApiError / handleActionError (server-only)
lib/auth/session.ts                     # + getCurrentMembership() (organizationId + role)
lib/auth/auth-error-mapper.ts           # Better Auth's {data,error} shape -> AppError
lib/react-query/query-client.ts         # QueryClient factory (client/server split)
lib/react-query/keys.ts                 # query key registry, starting with `auth`
lib/react-query/api-client.ts           # the one fetch wrapper every hook uses
components/providers/QueryProvider.tsx  # QueryClientProvider + Devtools, wired into app/layout.tsx
components/auth/ProtectedRoute.tsx      # client-side session-expiry guard (complements middleware.ts)
components/auth/AuthSkeleton.tsx        # loading skeleton
components/shared/ErrorState.tsx        # shared error presentation, all future domains reuse this
app/api/me/route.ts                     # NEW Route Handler: identity + organization + role
hooks/auth/use-current-user.ts
hooks/auth/use-login.ts
hooks/auth/use-signup.ts
hooks/auth/use-logout.ts
hooks/auth/use-role-check.ts
app/sign-in/page.tsx                    # migrated from raw useState+authClient to the hooks above
vitest.config.ts / vitest.server-only-stub.ts / vitest.setup.ts   # test infra fixes (see 4.4)
```

### 4.2 Why login/logout aren't new Route Handlers

Better Auth already owns `POST /api/auth/sign-in/email`, `/sign-up/email`, `/sign-out`, and session refresh via its catch-all at `app/api/auth/[...all]/route.ts`. Building parallel custom endpoints would either duplicate or fight its cookie-setting logic. Instead, `useLogin`/`useSignup`/`useLogout` wrap **Better Auth's own client SDK** (`lib/auth/auth-client.ts`) in `useMutation`, and `lib/auth/auth-error-mapper.ts` normalizes its `{ data, error }` return shape into the same `AppError` hierarchy every other domain's hooks use — so a component handles a failed login exactly like a failed transaction fetch.

The one genuinely missing piece was **role**: Better Auth's session only knows identity, not organization membership. `GET /api/me` (new) is the single endpoint that joins `getCurrentSession()` with `getCurrentMembership()` (new helper in `lib/auth/session.ts`) to expose `{ user, organizationId, organizationName, role }`.

### 4.3 The pattern every future domain replicates

1. Add a namespace to `lib/react-query/keys.ts` (`transactions: { all, list(...), detail(...) }`).
2. Build the Route Handler(s), thin: parse with the service's existing Zod schema → call exactly one `services/<domain>/*` function → `handleApiError` on throw.
3. Build one hook per operation in `hooks/<domain>/`, each calling `apiClient<T>(path, options)` — never `fetch` directly, never a repository/service import (that would pull server-only/Prisma code into the client bundle, the exact mistake `lib/api/errors.ts` vs `error-handler.ts`'s split exists to prevent).
4. Mutations invalidate the affected query keys in `onSuccess` (see `useLogin`/`useLogout` for the pattern — `useLogout` calls `queryClient.clear()` specifically because *all* cached data belongs to the signed-out user).
5. Wrap loading with a domain-specific skeleton, errors with `<ErrorState error={...} onRetry={...} />`, empty results with the page's existing (unchanged) empty-state copy.

### 4.4 Error handling

| Code | AppError class | Where it's thrown | UI treatment |
|---|---|---|---|
| 401 | `UnauthorizedError` | Session missing/expired | `ProtectedRoute` redirects to `/sign-in?redirect=<path>` |
| 403 | `ForbiddenError` | Role check fails server-side | `ErrorState` — "You don't have access" |
| 404 | `NotFoundError` | Record not found | `ErrorState` or inline "not found" per page |
| 409 | `ConflictError` | Unique constraint (duplicate budget category, self-merge, etc.) | Domain-specific toast, not generic |
| 422 | `ValidationError` | Zod parse failure | Inline field errors from `.details` |
| 429 | `RateLimitedError` | `middleware.ts`'s `apiRateLimit` | "Slow down" toast |
| 500 | `InternalError` | Anything unmapped | Generic `ErrorState`, real error logged server-side only |
| — | `NetworkError` | `fetch` itself threw | "Couldn't reach the server" |
| — | `TimeoutError` | `AbortController` timeout (15s default) | "That took too long" |

`lib/api/errors.ts` (client-safe classes) vs. `lib/api/error-handler.ts` (server-only mapping, imports Prisma + `NextResponse`) are **deliberately separate files** — this split matters for every future domain too, since `Prisma.PrismaClientKnownRequestError` cannot be imported into client bundles.

### 4.5 Testing

- `lib/auth/__tests__/session.test.ts` — real Postgres (user/org/membership rows), Better Auth's `getSession` mocked (the actual external boundary)
- `app/api/me/__tests__/route.test.ts` — `lib/auth/session.ts` mocked, exercises the Route Handler's 3 branches (no session / no membership / success)
- `hooks/auth/__tests__/use-current-user.test.ts`, `use-login.test.ts` — React Testing Library `renderHook` + a real `QueryClientProvider`, `fetch`/`authClient` mocked

Note: hook tests are written as `.ts` files using `React.createElement` rather than JSX — the installed Vite 8 / `@vitejs/plugin-react` combination currently has a peer-dependency conflict (`@rolldown/plugin-babel` → `@babel/core@8.0.0-rc`) blocking installation. Once resolved upstream, switch to `.tsx` + JSX for readability; the tests are correct either way.

All 394 tests pass (`npx vitest run`); `npx tsc --noEmit` is clean.

---

## Cross-cutting requirements — how they're satisfied

### React Query standards
- **Caching:** per-domain `staleTime` tuned to volatility (Auth 5min, Transactions 30s, Forecast short-but-shared, Coach long+server-cached)
- **Background refresh:** `refetchOnWindowFocus: true` globally (query-client.ts default)
- **Optimistic updates:** specified per-domain above (checkbox/toggle-shaped mutations only — never for destructive or externally-side-effecting actions)
- **Retries:** `shouldRetry` in `query-client.ts` — never retries 4xx (won't succeed), retries genuine 5xx/network twice
- **Invalidation:** every mutation's `onSuccess` documented per-domain above
- **Prefetching:** Server Components can call `queryClient.prefetchQuery` + `HydrationBoundary` for above-the-fold data (Dashboard, Transactions list) — add when wiring each page, not before
- **Pagination:** `useInfiniteQuery` for Transactions (the only genuinely large list); everything else is small enough for a plain list query
- **DevTools:** `ReactQueryDevtools`, development-only, already wired in `QueryProvider.tsx`

### Data persistence scope
`localStorage` remains for: theme (`next-themes`, already separate), sidebar-collapsed (already a cookie, not localStorage), and any future ephemeral form-draft state. Every key in the 1.2 inventory is domain data and is fully removed as its section of Part 3 completes.

### Data migration utility

A one-time, user-triggered import for anyone with existing browser data:

```
app/api/migration/localstorage-import/route.ts   # POST — accepts a JSON dump of the 43 keys
services/migration/localstorage-import-service.ts
```

Design:
1. A client-side utility (`lib/migration/collect-local-data.ts`) reads every key in the 1.2 table that still exists in the browser and bundles it into one JSON payload — this is the **last** piece of client code allowed to call `window.localStorage` directly, and only during the migration window.
2. `POST /api/migration/localstorage-import` — Zod-validates the bundle, then for each domain calls that domain's existing `services/*` create/upsert functions (e.g. `transactionService.createTransactions`), reusing the exact same validation and business logic real ingestion already goes through — **no parallel import code path**.
3. **Duplicate prevention:** relies on each domain's existing idempotency — Transactions have no natural dedup key today (this matches current behavior: CSV import already can double-import), so the migration utility hashes `(date, amount, note)` client-side and skips exact repeats within the bundle itself; server-side domains with real unique constraints (EmailMetadata's `(connectionId, messageId)`, Documents' duplicate-key fingerprint) get free dedup from the schema.
4. **Migration summary:** the response shape is `{ imported: Record<domain, number>, skipped: Record<domain, number>, errors: Record<domain, string[]> }`, rendered as a one-time summary screen ("Imported 340 transactions, 12 budgets, skipped 4 duplicates").
5. On success, the client clears the migrated `localStorage` keys (not before — if the import partially fails, the browser copy stays intact as a fallback).

This utility is itself out of scope for Part 4 (Authentication has no local data to migrate) — build it alongside Transactions (3.4), the first domain with real data volume.

### Validation
Every Route Handler in Part 3 reuses the Zod schema already defined in its `services/<domain>/<domain>-schema.ts` file — this is the literal mechanism for "share schemas between frontend and backend": the hook's mutation input type is `z.infer<typeof someInputSchema>`, imported from the same service file the Route Handler validates against. No schema is defined twice.

### Testing checklist (per domain, apply the pattern from 4.5)
- [ ] Route Handler: success path, each documented error code, Zod rejection shape
- [ ] Hook: success, typed error surfaces as the right `AppError` subclass, loading state transitions
- [ ] Mutation: optimistic update applies immediately where specified, rolls back on server error
- [ ] Cache invalidation: confirm the documented `onSuccess` invalidations actually refetch the right queries (not over- or under-invalidating)
- [ ] Empty state: renders when the list is genuinely empty, not stuck in a loading/error state
- [ ] Permission: a `VIEWER`-role request to a mutating endpoint returns 403 (once role checks are added server-side per-domain — Auth's `useRoleCheck` is UI-only gating today, per its own doc comment)
- [ ] Migration: for domains with real data volume, the localStorage-import utility's summary counts match a manual count of the browser data

---

## What's explicitly NOT in this plan

- Real external integrations (Gmail API, Account Aggregator, bank APIs, real OCR) — mocks stay mocked
- Inngest background job wiring — referenced by domains that need it (Recurring detection, Sync) but not built here
- Sentry/PostHog/observability wiring
- Any UI/UX change, however small — if a page's current empty-state copy is bad, that's a separate ticket, not this migration
- The Explanation model schema gap — flagged in 2.3, needs a decision before Insights/Feed/Budgets' "Why?" buttons can fully migrate
