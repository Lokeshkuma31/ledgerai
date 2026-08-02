# LedgerAI Dashboard Redesign — Design Specification

## Context

LedgerAI (branded "Ledgerline" in-app) has a mature, deliberate design system (Tailwind v4 tokens, `base-nova` shadcn on `@base-ui/react`, a 3-tier surface system, hand-rolled sparklines, a real badge-family idiom) and a surprising amount of real engineering underneath it — deterministic financial "engines" for forecasting, recurring detection, merchant knowledge, budgets, notifications policy, sync, and a full semantic search index. But the *presentation layer* hasn't caught up to the *engine layer*: the dashboard surfaces data in flat grids rather than guiding the user to a decision, several built engines are invisible in the UI (the search index isn't in Cmd+K, the notification policy engine "never delivers" anything, per its own settings copy), and a few areas (Notification Center, most of Settings) are effectively greenfield.

The goal of this engagement is to produce a **written design specification** — UX audit, information architecture, wireframe descriptions, microinteraction guidelines, and an implementation roadmap — that a development team (or a future engagement) can execute against. Per user decision, **this document is the deliverable for now**; no code was written in this engagement. A follow-up engagement would implement it wave-by-wave per the Phase 5 roadmap.

Per user direction: **Dashboard, Global Search, Transactions, Merchant Pages, and AI Coach** get full wireframe/microinteraction depth (they are the highest-leverage, most mature areas). **Connections, Documents/Email, Sync Center, Notification Center, Settings, and generic Detail Pages** get a solid but more concise IA + wireframe treatment, to be expanded once the flagship areas are validated in practice.

All recommendations below reuse the existing design system and existing engines — nothing here proposes rebuilding tokens, replacing shadcn/`@base-ui`, or re-architecting the localStorage/engine data layer.

---

## Phase 1 — UX Audit & Strategy

### Audit method
Each existing dashboard section was evaluated against: (1) does it answer one clear question, (2) does it guide toward a decision or just display data, (3) is its place in the information architecture progressive or arbitrary, (4) where would a first-time or returning user get lost.

### Current state (`components/dashboard/DashboardOverview.tsx`)
Today's order: action buttons (Import/Add Expense) → 4-up metric grid (Balance, Projected Month-End, Expected Expenses, Expected Income) → Cash Flow chart + Upcoming Bills → conditional AI Recommendations card → Recent Activity + Budgets-mini + Connections-mini.

### Findings, prioritized

1. **No single "what should I do right now" surface exists.** Budget risk (`state.budgets`), upcoming bills (`state.recurring`), connection health (`ConnectionsMini`), and AI recommendations are four *separately-styled* widgets scattered across the page, each with its own visual treatment and none ranked by urgency against the others. A user with one critical budget overrun and three routine bills has no way to tell which matters more at a glance. **This is the single highest-priority gap** — it's the literal difference between "data-heavy" and "decision-focused" that the brief asks to close.
2. **The AI Recommendations card is conditionally invisible.** It only renders `if (newRecommendations.length > 0)`, meaning the AI's presence in the product is inconsistent — some sessions it's there, some it isn't, with no persistent "AI is watching" affordance in between. A decision-focused product should always show *some* AI-authored framing of the current state, even when there's nothing urgent to flag ("Nothing needs attention today" is itself a valuable, calming answer).
3. **No welcome/orientation moment.** The page opens directly into the metric grid with no greeting, no "here's what changed since you were last here," and no connection-health-at-a-glance. Returning users get no sense of *time* (what happened since yesterday) before being shown absolute numbers.
4. **The four metric cards are not visually prioritized.** Balance, Projected Month-End, Expected Expenses, Expected Income are given equal visual weight (identical card size, grid position). For a decision-focused reading order, Balance/net-position should dominate, with the rest supporting it — right now the grid reads as a spreadsheet, not a hierarchy.
5. **Recent Activity is disconnected from source context.** `RecentActivity` shows the last 5 timeline transactions but doesn't distinguish *how* they arrived (manual entry vs. bank sync vs. email import vs. document import) — the brief specifically asks for "recent imports, connection activity, document/email imports" to be part of this story, and today those are four separate features (`/sync`, `/documents`, `/email`, `/connections`) with no dashboard-level rollup.
6. **No chronological "Timeline" section on the dashboard at all**, despite `lib/timeline/engine.ts::generateTimeline()` already running in the orchestrator and being present on `FinancialState` — this is a rendering gap, not an engine gap, and one of the cheapest high-value fixes available.
7. **Quick Actions are ad hoc, not a designed surface.** Today "Import" and "Add Expense" are two buttons in a top-right row; the brief asks for Import, Connect, Ask AI, Search, Create Budget, Manual Transaction as a coherent action surface, and none of the last four currently exist as a one-click affordance from the dashboard.
8. **Search is a hidden, disconnected capability.** A fully-built semantic index (13 entity types, ranking, filters) lives at `/search` as its own page, but Cmd+K — the natural "I need something now" gesture in a professional tool, invoked from anywhere — only searches page names. This is a significant, fixable gap between engineering investment and perceived product intelligence.
9. **AI Coach reads as a chatbot, not an advisor.** `AiCoachPageContent.tsx` places `FinancialCopilot` (chat) and `AICoachCard` (summary) as two side-by-side panels with no shared "workspace" framing — no persistent context panel, no pinned insights, no visible memory of past decisions. The backend (real Anthropic calls, deterministic forecast engine, scenario simulator) is strong; the framing undersells it.
10. **Transactions and Merchants are data tables/profiles, not decision surfaces.** No category iconography, no merchant avatars, and critically, no transaction detail page at all (only a review *modal*) — so a transaction can't be linked to, discussed, or deep-dived the way the brief's "rich cards... related transactions" vision implies. Merchant pages have real data (spend stats, aliases) but no trend visualization despite Recharts already being used for exactly this elsewhere (`CashFlowChart.tsx`).
11. **"Needs Attention" content is being computed piecemeal, not aggregated.** Budget status, feed severity, connection health, sync failures, and notification-policy priority already exist as separate typed outputs from separate engines — nothing currently merges them into one ranked list.

### What's already working well (preserve, don't touch)
- The badge-family idiom (`ConfidenceBadge`, `SeverityBadge`, `ForecastBadge`, etc.) is exactly the right pattern for status communication — extend it, don't replace it.
- The gradient `from-ai/10 to-card border-ai/30` treatment for AI-authored content is a good, distinct visual language for "the AI said this" vs. "this is raw data" — reuse it everywhere AI-authored copy appears (Today's Intelligence, AI Coach workspace, per-merchant insights).
- Sparklines-in-metric-cards (`lib/charts.ts::buildSparkline`) are a premium, already-correct pattern — reuse for merchant trend charts rather than inventing a new chart treatment.
- The Connection Hub and Sync Center are already close to premium quality (real OAuth, health states, retry/queue logic) — these need the least redesign work, just visual integration into a "Data Sources" umbrella (Phase 5, Wave 5).

---

## Phase 2 — Information Architecture

### IA principle
Every top-level nav destination must answer exactly one question. Where today's flat 19-item nav (`lib/nav.ts::NAV_ITEMS`) mixes primary decision surfaces with secondary/administrative ones at equal visual weight, the redesigned IA groups them so the sidebar itself communicates priority.

### Proposed nav grouping (extends, doesn't replace, `NAV_ITEMS`)
`NavItem` gains an optional `group` field; the sidebar and Cmd+K both read it, defaulting ungrouped items to a flat list for backward compatibility.

- **Overview** — Dashboard, AI Coach, Search
- **Money** — Transactions, Merchants, Budgets, Recurring, Forecast, Goals, Insights
- **Data Sources** — Connections, Documents, Emails, Banks, Sync *(Wave 5 umbrella — see Phase 5)*
- **System** — Feed *(→ Notification Center, see below)*, Workflows, Plugins, Settings

### Page-by-page IA (core question → flow)

1. **Home Dashboard** — *"What should I do right now, and how did I get here?"* Welcome Area → Financial Health → Needs Attention → Today's Intelligence → Recent Activity → Quick Actions → Timeline. Entry point from anywhere via sidebar "Dashboard" or logo click. Every Needs Attention / Today's Intelligence item deep-links to its detail page (transaction, budget, connection, etc.) — the dashboard is a router to decisions, not a dead end.

2. **AI Coach Workspace** — *"What does my advisor think, and can I ask it anything?"* Persistent layout: context panel (current forecast + pinned insights) always visible, conversation panel center-stage, suggested-questions + conversation history in a collapsible right rail. Reachable from sidebar, from the dashboard's "Ask AI" quick action, and from any per-entity "Why?" explainability button (already exists on merchant pages — extend the pattern here).

3. **Transaction Experience** — *"What was this, and is it correct?"* List (existing `TransactionsTable`) → click-through to a new `/transactions/[id]` detail page (hero: merchant avatar + amount + category icon + confidence/source badges; body: note, edit, related transactions, attachments if any). Entry points: Dashboard Recent Activity, Merchant page's transaction list, Search/Cmd+K results, direct nav.

4. **Merchant Pages** — *"How much do I spend here, and is anything recurring?"* Directory (existing `MerchantDirectory`) → `/merchants/[id]` (existing route, extended): hero with avatar, spending trend chart (new), recurring-payments-here section (new, filters existing `lib/recurring` data), category breakdown, related transactions, forecast contribution. Entry points: transaction detail's merchant link, Search, directory.

5. **Global Search** — *"Where is the thing I'm thinking of?"* Two surfaces, one engine: Cmd+K (fast, top-N, anywhere) and `/search` (full, filtered, statistics). See Phase 5 §5.3a for the shared-hook architecture that keeps them from diverging.

6. **Connection Hub** — *"Is my data flowing correctly?"* Provider cards (existing, mature) grouped under the "Data Sources" nav umbrella alongside Documents/Email/Banks/Sync, with a shared status strip surfacing aggregate health at the top of all five pages.

7. **Document & Email Centers** — *"What did I import, and did it extract correctly?"* Existing extraction/review pipelines, reframed with the Data Sources umbrella's shared status strip. Gallery/preview enhancements are explicitly a **lighter-depth** item this round (see Phase 3).

8. **Sync Center** — *"Is everything up to date, and what failed?"* Already the most mature hub; folded visually into Data Sources, otherwise largely as-is.

9. **Notification Center** — *"What needs my attention that I haven't seen yet?"* New bell-dropdown (compact variant of the existing Feed) + the existing full `/feed` page as its expanded form — one shared component, two densities (Phase 5 §5.3c).

10. **Settings** — *"How do I configure this app?"* Expanded from 4 cards to a searchable, sectioned settings shell (Profile, Appearance, Connections, Notifications, AI, Privacy, Security, Imports, Plugins, Advanced) — see Phase 3 for the lighter-depth wireframe.

11. **Detail Pages** — *"Give me everything about this one thing."* A consistent detail-page template (hero + stat row + tabs/sections + related-items rail) used by Transaction, Merchant (existing, retrofitted), Connection, Sync Job, Budget, Recurring Payment, Forecast, Notification, Workflow, and Document detail views, so a user who learns one detail page's layout already knows all the others.

---

## Phase 3 — Wireframe Descriptions

### 3.1 Home Dashboard *(full depth)*

**Section order and layout:**

1. **Welcome Area** — full-width band above the metric grid. Left: dynamic greeting ("Good morning" / "Good afternoon" by local time) + current month label in `font-heading`. Right-aligned within the same band: a compact connection-health strip (small `StatusDot` cluster, one per active connection, reusing `ConnectionsMini`'s health-dot idiom but promoted to always-visible). Below the greeting, one line of AI-authored copy — reuses the `AICoachCard` summary generation but always renders (never conditionally hidden, per Audit finding #2), falling back to a calm "Nothing urgent — you're on track" when there's nothing to flag. Net-spend-this-month rendered via the new `AnimatedCounter`, in `font-numeric`, as the single largest number on the page — establishing immediate visual hierarchy before the metric grid even starts.

2. **Financial Health** — the existing 4-up metric grid, re-ordered so Balance Estimate is visually dominant (spans 2 columns on `lg+`, or is simply first and given a subtitle row) with Projected Month-End, Expected Expenses, Expected Income as clearly secondary, smaller cards beside it — replacing today's 4 equal-weight cards (Audit finding #4). Sparklines and trend badges unchanged (`MetricCard`, `lib/charts.ts` — reuse as-is).

3. **Needs Attention** — new section, powered by `lib/attention/aggregator.ts::buildAttentionItems()` (Phase 5). A ranked list (not a grid) of `AttentionItem`s — budget risks, upcoming bills due soon, failed syncs, connection issues, recurring-payment anomalies — each row: `SeverityBadge` (reused unmodified) + title + one-line summary + a single CTA button that deep-links to the relevant detail page. This single section directly answers Audit finding #1 — it is the section that makes the dashboard "decision-focused" rather than "data-heavy." Empty state: a calm confirmation card, not a blank void ("All clear — nothing needs your attention").

4. **Today's Intelligence** — distinct from Needs Attention (that's *urgent*; this is *interesting*). AI recommendations (existing `RecommendationCard`, existing gradient `from-ai/10` treatment, preserved), financial events (`state` already carries detected events), merchant insights, and trend changes, in a horizontally-scrollable card row on desktop, stacked on mobile. This is where the existing conditional AI Recommendations card content moves to, now always-present with graceful empty/low-content states rather than disappearing entirely.

5. **Recent Activity** — existing `RecentActivity` component, extended with a small source-icon per row (bank sync / email import / document import / manual entry) so users can trace *how* a transaction arrived without leaving the dashboard (Audit finding #5) — this only requires exposing an already-known field per transaction, not new engine work.

6. **Quick Actions** — a dedicated row of icon+label action chips: Import (existing `ImportDialog`), Connect (links to Connection Hub), Ask AI (opens AI Coach or a lightweight inline prompt), Search (opens Cmd+K), Create Budget, Manual Transaction (existing `AddExpenseDialog`). Visually distinct from Needs Attention's CTA buttons — these are user-initiated, not system-surfaced.

7. **Timeline** — new section, rendering `state.timeline` (already computed, never surfaced today per Audit finding #6) as a condensed chronological strip beneath everything else — the "how did I get here" closing note for the page, positioned last since it's contextual/historical rather than actionable.

**Empty state:** first-run (no transactions) keeps today's single empty card but reframes its copy around the Quick Actions row directly below it, so the empty dashboard *is* an invitation to use Import/Connect, not a dead end.

**Loading state:** skeleton blocks matching each section's real layout (not today's single "Refreshing…" line) — Welcome Area skeleton shows a greeting-shaped bar + connection-dot placeholders; Needs Attention shows 2-3 skeleton rows; this requires extending the minimal `components/ui/skeleton.tsx` usage, not replacing the primitive itself.

**Error handling:** if `buildFinancialState()` partially fails (the orchestrator already catches per-engine errors into `state.warnings[]`), surface a small inline warning strip at the top of the affected section only (e.g., "Forecast temporarily unavailable — showing last known values") rather than a page-level generic error, since the orchestrator's per-engine try/catch already gives us the granularity to do this.

### 3.2 Global Search *(full depth)*

**Cmd+K (fast surface):** unchanged trigger (`⌘K`/`Ctrl+K`), but results now blend page navigation (existing `NAV_ITEMS`) with live cross-entity results from the shared search hook (Phase 5 §5.3a) — grouped sections "Pages" and "Results" (transactions, merchants, budgets, etc.), capped at ~5-8 results per group, each row showing entity-type icon + title + one contextual line (amount+date for transactions, spend total for merchants). Arrow-key navigation and Enter-to-open, consistent with existing `cmdk` behavior. A "See all results for '...'" row at the bottom routes to the full `/search` page with the query pre-filled.

**`/search` (full surface):** existing `SearchOverview.tsx` layout preserved — search bar, filters (type/category/merchant/date-range/amount-range), result cards, recent searches, statistics — now sourced from the same hook as Cmd+K so ranking never diverges between the two surfaces. Settings pages become a 14th indexed entity type (small addition to `lib/index/builder.ts`), closing the "Settings isn't searchable" gap from the audit.

**Empty state:** no-results shows the query plus a "Try asking AI Coach instead" CTA — connecting Search to AI Coach rather than dead-ending.

**Loading:** since the index is built client-side from already-loaded `FinancialState`, there's no network loading state to design for — only an input-debounce (150-200ms) before re-querying, avoiding per-keystroke re-ranking jank.

### 3.3 Transaction Experience *(full depth)*

**List view** (existing `TransactionsTable.tsx`, retrofitted): each row gains a `CategoryIcon` (new) beside the category badge, and a `MerchantAvatar` (new, initials-based) beside the merchant name — closing Audit finding #10's iconography/avatar gap without changing the table's existing filter/sort/search behavior.

**Detail page** (`app/(app)/transactions/[id]/page.tsx`, new route): hero row — `MerchantAvatar` (large) + amount in `font-numeric` + category icon-and-label; badge row — `ConfidenceBadge` (existing) + classification-source badge (existing, from the currently-unused `TransactionCard.tsx` — promote this badge into the new detail page rather than inventing a new one) + payment-method badge. Body: original note (editable inline, reusing `ReviewTransactionDialog`'s category-correction `Select` pattern rather than a new edit UI), a "Related Transactions" rail (same merchant, or same category within the last 30 days — a small new query against already-loaded transactions, no new engine), and an attachments section that only renders if the transaction was created via document/email import (uses the existing `AttachmentList` component, currently email-only — extend its usage here rather than building a second attachments component).

**Empty/loading/error:** detail page skeleton mirrors the hero+body layout; a transaction ID that doesn't resolve shows a "Transaction not found — it may have been merged or deleted" message with a link back to the list, not a generic 404.

### 3.4 Merchant Pages *(full depth)*

Extends the existing `MerchantProfile.tsx` / `/merchants/[id]` route (already real) rather than replacing it:

- **Hero:** `MerchantAvatar` (large, initials) + canonical name + industry/type/category/recurring/online badges (existing) + tags (existing).
- **Spending trend chart (new):** a Recharts area/line chart of this merchant's spend over the trailing 6-12 months, built the same way `CashFlowChart.tsx` already builds its trailing-6-month view — same component pattern, filtered to one merchant's transactions instead of all.
- **Recurring payments here (new):** filters `lib/recurring/engine.ts` output (which already carries `merchantName?`) down to this merchant and renders using the existing recurring-item card treatment from `/recurring` — no new detection logic, purely a filtered render.
- **Categories breakdown:** existing stat grid, retained.
- **Insights:** reuses the "Today's Intelligence" card treatment (gradient `from-ai/10`) for any merchant-specific AI observation, keeping the "AI said this" visual language consistent app-wide.
- **Forecast contribution:** a small callout showing this merchant's weight in the overall forecast, sourced from existing forecast engine output.
- **Related transactions:** existing "up to 10 recent transactions" list, retrofitted with `CategoryIcon` + linking to the new transaction detail pages (3.3).
- **"Why?" explainability button:** existing, preserved as-is — and the same affordance should be extended to Dashboard's Needs Attention/Today's Intelligence items for consistency.

### 3.5 AI Coach Workspace *(full depth)*

Reframes `AiCoachPageContent.tsx` from "two side-by-side panels" into a workspace layout without touching `lib/ai/provider.ts`'s Anthropic call path:

- **Left rail (context, persistent):** current forecast snapshot (reuses `ForecastCard`/`ForecastBadge`), pinned insights (user-pinnable AI observations, new but small — a pin flag on existing recommendation/insight items), recent decisions (reuses existing recommendation status tracking).
- **Center (conversation):** existing `FinancialCopilot` chat, visually promoted to the primary focus area rather than sharing equal width with the summary card.
- **Right rail (collapsible):** suggested questions (existing `SuggestedQuestions`), conversation history (existing `ConversationHistory`, `lib/query/history.ts`), and a "context sources" disclosure listing which engines fed the current answer (forecast, budgets, merchants, etc.) — a transparency affordance that doesn't exist today and directly supports the "feel like a financial advisor" goal by showing its work.
- **Scope note carried into the roadmap:** conversation history today is not fed back into the LLM prompt as true multi-turn memory (`lib/query/history.ts` persists it, but `answerFinancialQuery()` doesn't appear to consume prior turns) — Phase 5 flags this as a conscious scope decision for the implementation team, not something to silently paper over with copy that implies memory that isn't there.
- **Empty state:** first-time AI Coach visit shows Suggested Questions prominently (already exists) with the context/pinned-insights rails in an explicit "nothing pinned yet" state rather than blank.

### 3.6 Connection Hub, Document & Email Centers, Sync Center *(lighter depth — "Data Sources" umbrella)*

All five (Connections, Documents, Emails, Banks, Sync) gain a **shared status strip** at the top of each page — a horizontal row of provider health dots (reusing `ConnectorHealthBadge`/health-dot idioms already built for Connections and Sync) so a user lands on any Data Source page and immediately sees the health of *all* sources, not just the one they clicked into. Otherwise, each page's existing mature internals (`ConnectionHub`, `DocumentIntelligenceDashboard`, `EmailDashboard`, `SyncDashboard`) are preserved as-is this round. Gallery/thumbnail previews for documents and email attachments (currently metadata-only, no real file/image preview) are noted as a valuable but explicitly deferred enhancement — not in this round's depth.

### 3.7 Notification Center *(lighter depth)*

A new bell-dropdown in `Topbar.tsx` (currently decorative) opens a `Sheet`/popover showing a **compact variant** of the existing Feed — same `FeedItem` data, denser cards, top-N by priority, "View all in Feed" link to the full `/feed` page. Unread count badge on the bell icon. This is the first UI in the app that actually *delivers* what `lib/policy`'s notification engine only *recommends* today — closing the "never delivers anything" gap noted in the audit without touching the policy engine's logic itself.

### 3.8 Settings *(lighter depth)*

Restructured from today's flat 4-card grid into a two-pane shell: a left sub-nav (Profile, Appearance, Connections, Notifications, AI, Privacy, Security, Imports, Plugins, Advanced) + right content pane, with a search box at the top of the sub-nav that queries the same shared search hook (3.2) now that Settings pages are an indexed entity type. Existing sections (Import History, Sources, Memory, Notifications) map directly onto Imports/Advanced/AI/Notifications respectively; Profile, Appearance, Privacy, Security are net-new, minimal-viable pages this round (e.g., Appearance = promote the existing theme-cycle control into a proper settings page with light/dark/system radio options, rather than only a topbar icon-cycle).

### 3.9 Detail Pages *(lighter depth — shared template)*

One template — hero (icon/avatar + primary identifier + primary stat) + badge row (status/confidence/severity as applicable) + body (sections/tabs) + related-items rail — used consistently by Transaction (3.3, full depth this round) and retrofitted onto Merchant (3.4, full depth), with Connection, Sync Job, Budget, Recurring Payment, Forecast, Notification, and Workflow detail pages following the same template in later rounds.

---

## Phase 4 — Microinteractions & Polish

All motion is authored against a new shared token layer (Phase 5, `lib/motion.ts`) rather than the current per-component hardcoded `duration-*` classes, and every animated primitive must degrade gracefully under `prefers-reduced-motion` (not handled anywhere today — a real gap being closed here).

- **Hover/focus/selection:** preserve the existing `focus-visible:ring-3 focus-visible:ring-ring/50` idiom already baked into Button/Badge CVA bases — extend it to any new interactive element (Needs Attention rows, Notification Center items, Cmd+K result rows) rather than inventing a new focus treatment.
- **Loading/success animations:** `AnimatedCounter` count-up on first mount and whenever a tracked value changes (net spend, balance, metric cards); a brief success pulse (border-color flash using the `success` token) on actions like "budget created," "transaction reviewed," "sync retried."
- **Error recovery flows:** every error state (Dashboard section failure, transaction-not-found, sync failure) pairs a plain-language explanation with one concrete recovery action — never a bare "Something went wrong."
- **Page transitions / drawer animations:** continue the existing `tw-animate-css` + base-ui `data-open`/`data-closed` idiom for Dialog/Sheet (Notification Center's new Sheet, Settings' panels) — no new animation library.
- **Timeline/card expansion:** Needs Attention rows and Timeline entries expand in-place (height auto-transition using the new motion tokens) rather than navigating away, for quick triage without losing dashboard context.
- **Chart interactions:** merchant trend chart and Cash Flow chart share the existing `ChartTooltip`/`ChartTooltipContent` wrapper (`components/ui/chart.tsx`) for consistent hover behavior — no new chart interaction pattern needed.
- **Keyboard shortcuts:** Cmd/Ctrl+K (existing) now also reachable to jump into merged nav+search results; Esc closes Cmd+K/Sheets/Dialogs (existing base-ui behavior); arrow-key navigation within Cmd+K results and the Notification Center dropdown; full Tab order audited for the new Needs Attention list and Quick Actions row specifically, since those are new interactive surfaces.
- **Mobile adaptations:** bottom quick-actions bar on mobile (replacing the desktop Quick Actions row) surfacing the 3-4 most common actions; Needs Attention and Today's Intelligence become swipeable card stacks rather than stacked lists; a floating "Ask AI" button pinned bottom-right on mobile, opening the AI Coach workspace as a full-screen sheet; transaction/merchant tables collapse into the existing card variants (`TransactionCard.tsx`, currently unused — this is exactly its intended use case) below the `md` breakpoint, consistent with the sidebar's existing `768px` mobile breakpoint (`hooks/use-mobile.ts`).
- **"Alive" feel without excess motion:** live `StatusDot` (new, pulsing) for active connections/syncs only — static dots elsewhere; animated counters only for values that actually just changed (not on every re-render); no motion introduced purely for decoration.

---

## Phase 5 — Implementation Roadmap

*(Architecture below was validated by a dedicated planning pass against the real codebase — file paths and existing patterns are confirmed, not assumed.)*

### 5.1 Wave 0 — Shared Primitives Foundation (blocking prerequisite for everything else)

Build in parallel where noted; this wave has no visible feature change, it's pure infrastructure.

| Primitive | File(s) | Wraps/extends | Notes |
|---|---|---|---|
| Motion tokens | `lib/motion.ts`, new `--motion-duration-*`/`--motion-ease-*` vars in `app/globals.css` | Extends the existing token-authoring pattern already used for `--radius-*` | No new dependency |
| Reduced-motion hook | `lib/hooks/useReducedMotion.ts` | `window.matchMedia` | Depends on nothing else in this wave |
| Category icons | `lib/categoryIcons.ts`, `components/shared/CategoryIcon.tsx` | `types/transaction.ts::Category` union, `lucide-react` (existing dep) | Add exhaustiveness test (5.5) |
| Merchant avatar | `components/shared/MerchantAvatar.tsx` | `components/ui/avatar.tsx` | Initials-based only this round — explicitly do NOT wire a third-party favicon/logo API (privacy/scope decision deserving separate sign-off) |
| Attention aggregator | `types/attention.ts`, `lib/attention/aggregator.ts` | Projects `BudgetStatus[]`, `FeedItem[]`, connection health, sync failures, `NotificationCandidate[]` into one `AttentionItem[]`; reuses `FeedSeverity` as its severity type so it renders through the existing, unmodified `components/SeverityBadge.tsx` | Same architectural pattern as `lib/index/ranking.ts`'s cross-entity normalization — not new engineering risk |
| Animated counter | `components/shared/AnimatedCounter.tsx` | Wraps the inline `<div className="font-numeric">{value}</div>` pattern in `MetricCard.tsx` | Depends on motion tokens; must snap instantly under reduced motion |
| Status dot (live) | `components/shared/StatusDot.tsx` | Existing `animate-pulse` (already used by `Skeleton`) | Depends on motion tokens; static+labeled fallback under reduced motion |

### 5.2 Wave sequencing (Waves 1-6)

1. **Wave 1 — Cmd+K/Search unification.** Low risk (wiring against an already-complete backend), high leverage. New: `lib/index/useFinancialSearch.ts` shared hook consumed by both `CommandPalette.tsx` and `SearchOverview.tsx`; add Settings as a 14th indexed entity type in `lib/index/builder.ts`.
2. **Wave 2 — Home Dashboard redesign.** Highest visibility, now unblocked by Wave 0. Rebuild `components/dashboard/DashboardOverview.tsx` per §3.1.
3. **Wave 3 — Transactions + Merchant pages.** Grouped (natural cross-links). New `app/(app)/transactions/[id]/page.tsx`; extend `MerchantProfile.tsx` with trend chart + recurring-here section.
4. **Wave 4 — AI Coach workspace.** Recompose `AiCoachPageContent.tsx` per §3.5; `lib/ai/provider.ts` untouched except for the flagged conversation-memory scope decision.
5. **Wave 5 — Data Sources visual unification.** `NavItem` gains `group` field (`lib/nav.ts`), both `AppSidebar.tsx` and `CommandPalette.tsx` updated; shared status strip across Connections/Documents/Email/Banks/Sync. Explicitly **not** a backend/OAuth unification (see §5.3b).
6. **Wave 6 — Notification Center + Settings expansion.** Deliberately last — both are near-greenfield, so they're built by composition from four prior waves' proven patterns rather than invention.

### 5.3 Cross-cutting architectural decisions

- **(a) Cmd+K vs. `/search`:** one shared hook (`lib/index/useFinancialSearch.ts`) owns `buildFinancialIndex()` + exposes `search()`/`recentSearches`/`statistics`; both surfaces consume it so ranking can never drift between them. `lib/index/filters.ts`/`ranking.ts` untouched.
- **(b) Connections/Documents/Email real-vs-mock OAuth:** explicitly **out of scope** for this redesign. Ship only the presentational Data Sources shell (nav grouping + shared status strip). State this explicitly in any implementation kickoff so it isn't assumed to be a side effect of Wave 5. An optional future `lib/dataSources/facade.ts` normalizing `{id, providerName, kind: "oauth"|"mock", healthStatus}` is noted as a possible fast-follow, not a commitment.
- **(c) Notification Center sourcing:** extract feed-rendering into a presentational component with a `variant: "full" | "compact"` prop, consumed by both `/feed` and the new bell-dropdown. New `lib/feed/useNotificationCenter.ts` + a pure, testable `selectNotifiableFeedItems(feedItems, policyDecisions, now)` function — the first real consumer that turns the policy engine's decisions into actual delivery.

### 5.4 Performance strategy

- **Large transaction lists:** add `@tanstack/react-virtual` (new, scoped dependency — confirmed no virtualization library exists today) to `TransactionsTable.tsx` and `SearchOverview.tsx`'s results list only; not applied to small/capped lists (merchant page's 10 recent transactions, budget cards).
- **Avoiding redundant recomputation:** `DashboardProvider.refresh()` currently reruns the entire orchestrator pipeline every call, with only the Coach step memoized (`lib/coach/cache.ts`'s signature-diff cache). Generalize that exact proven pattern to the 2-3 costliest sub-computations (likely `generateFeed`, `detectFinancialEvents`, `generateForecast`) — scoped as an optional Wave 2/3 follow-up once real transaction volumes surface actual jank, not a blocking prerequisite.
- **Code-splitting:** route-level splitting is already free via the App Router. Additionally, `next/dynamic({ ssr: false })` for non-first-paint-critical, no-SEO-value visualizations: `CashFlowChart.tsx`, the new merchant trend chart, the AI Coach chat panel, the full `SearchOverview` results grid.

### 5.5 Testing approach

Unit tests follow the existing `lib/*/__tests__/*.test.ts` convention (vitest + jsdom, already used across `lib/banks`, `lib/connections`, `lib/email`, `lib/sync`, `lib/timeline`):
- `lib/attention/__tests__/aggregator.test.ts` — severity mapping/ranking correctness against fixed fake `FinancialState` slices.
- `lib/hooks/__tests__/useReducedMotion.test.ts` — mocked `matchMedia`.
- `lib/categoryIcons.test.ts` — exhaustiveness check that every `Category` union member maps to an icon.
- `lib/feed/__tests__/selectNotifiableFeedItems.test.ts` — the extracted pure selection logic.

Manual QA checklist (no Playwright/e2e tooling exists today; introducing one is flagged as a separate tooling decision, not silently bundled in):
1. `prefers-reduced-motion` toggle — confirm `AnimatedCounter`/`StatusDot`/sparklines degrade to static, not merely slower.
2. Dark/light parity for every new component (`next-themes` means every new surface needs both passes).
3. Keyboard navigation for Cmd+K's merged results and the new Notification Center dropdown.
4. Empty-state and skeleton behavior for every new widget (Needs Attention, Today's Intelligence, zero-unread Notification Center).
5. Large-dataset stress check for the virtualized `TransactionsTable` (seed several hundred transactions via existing import flows, confirm scroll performance).

### Critical files referenced throughout this spec
`components/dashboard/DashboardOverview.tsx`, `components/DashboardProvider.tsx`, `lib/intelligence/orchestrator.ts`, `lib/coach/cache.ts`, `lib/nav.ts`, `components/app-shell/CommandPalette.tsx`, `lib/index/search.ts` (+`builder.ts`/`filters.ts`/`ranking.ts`), `components/SeverityBadge.tsx`, `components/TransactionsTable.tsx`, `components/TransactionCard.tsx` (currently unused — reactivate), `components/MerchantProfile.tsx`, `components/AiCoachPageContent.tsx`, `lib/ai/provider.ts`, `types/feed.ts`, `lib/feed/*`, `lib/recurring/engine.ts`, `lib/charts.ts`, `app/globals.css`, `components/app-shell/Topbar.tsx`.

---

## How this document should be validated

Since the deliverable this round is the specification itself (no code changes), validation is a **review pass**, not a test run:
1. Walk each Phase 2 IA entry against `lib/nav.ts::NAV_ITEMS` to confirm every existing route has a home in the new grouping and nothing is silently dropped.
2. Confirm each Phase 3 wireframe references only components/engines confirmed to exist in this research pass (all file paths above were verified via direct file reads or agent exploration this session, not assumed).
3. When implementation begins (a separate future engagement), each Phase 5 wave should be executed and reviewed independently — Wave 0's primitives should be code-reviewed and unit-tested (§5.5) before any feature wave consumes them, since a defect in `AnimatedCounter` or the attention aggregator would otherwise propagate into every downstream wave.
