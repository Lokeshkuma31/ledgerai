# Financial Visualization System — Specification & Roadmap

## Context

This document is the durable record for the "enterprise-grade Financial Visualization System" engagement — the analytics IA, the full ~32-chart inventory with collapse/defer rationale, the interaction model, the performance strategy, and what's actually built vs. backlog. It plays the same role `dashboard-redesign-spec.md` played for the previous dashboard-redesign engagement: whoever picks up the next wave should be able to start from this file instead of re-deriving the research.

**Hard rule governing every decision below**: charts and the visualization layer never compute business logic. They consume the existing deterministic engines (forecast, budget, recurring, merchant, feed, events) — a chart aggregating/bucketing/comparing already-computed numbers is fine; a chart deriving a new financial estimate is not.

**Status**: Waves 0-8 are built — visualization engine foundations, chart chrome primitives, and all ten `/analytics` sections (Overview, Cash Flow, Categories, Budgets, Forecast, Recurring, Merchants, Patterns/heatmaps, Data Sources, AI Insights, Timeline), full CSV/PNG/PDF/Print export, period comparison, an annotations layer, brush-to-custom-range on the Cash Flow chart, inline drill-down on Categories, and a reduced-motion pass across every Recharts element. What remains is a small, explicitly out-of-scope list (below), not a wave backlog.

---

## Analytics IA

`/insights` stays as the fast, single-purpose "spending by category" glance page (unchanged, plus one new "View full analytics →" link). `/analytics` is the comprehensive hub, with an in-page segmented control rather than sub-routes so there's one shared `TimeRange`/`ComparisonMode` filter state:

| Section | Status | Primary data source |
|---|---|---|
| Overview | **Built** | KPI tiles (`lib/visualization/statistics.ts`) + compact Cash Flow + compact Categories |
| Cash Flow | **Built** | `generateMonthlyCashFlow` (`lib/timeline/monthly.ts`) via `lib/visualization/aggregator.ts` |
| Categories | **Built** | `Insights.categoryBreakdown`-equivalent via `bucketByCategory` |
| Budgets | **Built** | `BudgetStatus[]`, historical `calculateBudgetStatus` calls for burn rate |
| Forecast | **Built** | `CashFlowForecast`, `ForecastStatistics` (two-point projection only — see below) |
| Recurring | **Built** | `RecurringTransaction[]`, `RecurringStatistics` |
| Merchants | **Built** | `MerchantProfile[]`, `MerchantKnowledgeStatistics` |
| Patterns (heatmaps) | **Built** | `bucketByDay`/`bucketByDayOfWeek` (`lib/visualization/aggregator.ts`) |
| Data Sources (merges Connections + Imports) | **Built** | `getAllSyncJobs()`, `getImportHistory()` |
| AI Insights | **Built** | `Recommendation[]` (`lib/decision/engine.ts`), not `CoachOutput` |
| Timeline | **Built** | `FinancialEvent[]` (`lib/events/engine.ts`) |

**Data Sources merge rationale**: Connections and Imports are each too thin alone (health/status records and an import log, no spend data) to warrant two separate top-level tabs; merging mirrors `lib/nav.ts`'s existing `"Data Sources"` `NavGroup` naming.

---

## Visualization inventory & collapse rationale

The brief asked for ~32 distinct "chart types." Most collapse into a small number of configurable components:

| Collapsed component | Absorbs | Status |
|---|---|---|
| `CashFlowSeriesChart` | Cash Flow Timeline, Income vs Expense, Net Spend Trend, Savings Trend | **Built** |
| `CategoryBreakdownChart` | Category Spending, Top Categories | **Built** |
| `TopEntitiesChart` | Top Merchants (+ Top Categories, already covered above) | **Built** |
| `BudgetProgressChart` / `BudgetBurnRateChart` | Budget Progress, Budget Burn Rate (via repeated `calculateBudgetStatus` calls per historical month — still "consuming the engine," not reimplementing budget math) | **Built** |
| `ForecastProjectionChart` | Forecast Projection (two real points — `currentBalanceEstimate` → `projectedEndOfMonthBalance` — plus the `dailySafeSpend` slope, **not** a rich multi-day curve, since no day-by-day forecast series exists), Forecast Confidence (a scalar badge, not a trend, since no historical forecast snapshots are persisted) | **Built** |
| `RecurringTimelineChart` | Recurring Payments Timeline, Subscription Calendar (view prop) | **Built** |
| `ConnectionActivityChart` | Connection Activity, Sync Activity (group-by prop), sourced from `getAllSyncJobs()` (`lib/sync/history.ts`) | **Built** |
| `ImportSourcesChart` | Import Sources, sourced from `getImportHistory()` (`lib/import/history.ts`) — caveat: "source" resolves to filename, not a bank/provider name | **Built** |
| `EventsTimelineChart` | Financial Events Timeline, AI Recommendation Timeline (adapter prop; recommendations come from `Recommendation[]`, not `CoachOutput`) | **Built** |
| `CalendarHeatmap` | Weekly Spending Pattern, Daily Spending Heatmap — one generic grid primitive (`groupBy`/`metric`) fed by `bucketByDay`/`bucketByDayOfWeek`, not six bespoke components. Category/merchant/hour-of-day groupings are trivial additions later (the component is already generic) but weren't wired into `/analytics` this round | **Built** (2 of the 6 named variants wired in; component supports more) |

## Explicitly out of scope (not buildable without new business logic or infrastructure)

| Item | Reason |
|---|---|
| "Vacation Spending" annotation | No corresponding `FinancialEventType` exists in `types/event.ts`; building one requires new detection logic in the charts layer, which the hard rule forbids |
| Forecast Projection as a rich multi-day/multi-scenario curve | Would require repeated `simulateScenario` calls per day — expensive, and `lib/forecast` doesn't persist a day-by-day series today |
| Historical Forecast Confidence trend | No forecast snapshots are persisted anywhere; needs new persistence infrastructure outside this feature's scope |
| Full Report generation (Monthly/Quarterly/.../Connection reports) | A separate, project-sized templating+pagination feature |
| Share | No sharing/link infrastructure exists anywhere in the app |
| True pixel zoom/pan | Recharts 3.8 has no native support; would need a new library or risky hand-rolled transform math |
| Cross-page drill-down into `/transactions` pre-filtered | Requires an additive search-param filter change to a shipped page outside this feature's boundary |
| `@tanstack/react-virtual` | Unnecessary at this feature's real scale; revisit only if real jank is observed |

---

## Architecture (as built)

- **`components/ui/chart.tsx`'s `ChartContainer`** stays exactly as-is — the low-level Recharts/CSS-var wrapper every chart mounts underneath. The "card with header/filters/legend/export" concept is **`ChartCard`** (`components/charts/ChartCard.tsx`), avoiding the naming collision.
- **`lib/visualization/`**: `types.ts`, `engine.ts` (`resolveTimeRange`, `resolveComparisonWindow`, `filterTransactionsByRange`, `precedingWindow`, `parseLocalDate`), `aggregator.ts` (`bucketByCategory`, `effectiveCategory`, `buildCashFlowSeries` wrapping `generateMonthlyCashFlow`, `toNetSeries`, `resolveCashFlowMonthsBack`, `buildBudgetBurnRateSeries` wrapping `calculateBudgetStatus`, `bucketByDay`, `bucketByDayOfWeek`), `statistics.ts` (generic math: mean/median/variance/stddev/percentile/movingAverage/growthRate/summarizeStatistics), `comparison.ts` (`comparePeriods`), `formatter.ts` (₹/`en-IN` formatting, dedupes what was inline in `CashFlowChart.tsx`/`MerchantSpendChart.tsx`), `annotations.ts` (`projectEventAnnotations`), `cache.ts` (mirrors `lib/coach/cache.ts`'s signature-diff shape — not yet consumed by any chart; all Wave 0-8 aggregations proved cheap enough for plain `useMemo`), `filterPreferences.ts` (mirrors `lib/coach/pinnedInsights.ts`'s read/write shape).
- **`components/charts/`**: `ChartCard`, `FinancialTooltip`, `ChartLegend` (click-to-toggle series, a from-scratch interactive legend — not `ChartLegendContent`, which only renders Recharts' own static payload), `ChartFilters`, `TimeRangeSelector`, `ComparisonSelector`, `ChartExport` (CSV hand-rolled; PNG/PDF via dynamically-imported `html2canvas`/`jspdf` so their bundle cost is paid only on export, not on page load; Print via a generated print window), `ChartEmptyState`, `ChartLoadingState`, `CashFlowSeriesChart` (+ `Brush`, `AnnotationMarkers`), `CategoryBreakdownChart` (+ inline drill-down), `AnnotationMarker`, `BudgetProgressChart`, `BudgetBurnRateChart`, `ForecastProjectionChart`, `RecurringTimelineChart`, `TopEntitiesChart`, `CalendarHeatmap`, `ConnectionActivityChart`, `ImportSourcesChart`, `EventsTimelineChart`.
- **New dependencies**: `html2canvas`, `jspdf` (PNG/PDF export). No date library added — range/comparison math is hand-rolled in `engine.ts`, consistent with the codebase's existing convention (`generateMonthlyCashFlow` has no date-lib dependency either).
- **Existing charts untouched**: `components/dashboard/CashFlowChart.tsx` and `components/MerchantSpendChart.tsx` were not modified.

---

## Interaction model — built vs. backlog

| Interaction | Status |
|---|---|
| Hover / tooltip | Built (`FinancialTooltip`) |
| Legend toggle / cross-highlighting | Built (`ChartLegend`, client-state series visibility) |
| Compare (previous period/month/year/custom) | Built (`comparePeriods` + `resolveComparisonWindow`, rendered as delta badges) |
| Export: CSV / PNG / PDF / Print | Built (`ChartExport`) |
| Fullscreen | Built (`ChartCard`'s expand dialog) |
| Custom time range | Built (plain date inputs in `TimeRangeSelector`) |
| Annotations (auto-detected events on the chart axis) | Built (`lib/visualization/annotations.ts::projectEventAnnotations` — a thin projector from `FinancialEvent[]`, never a new detector — rendered via `AnnotationMarker.tsx` on `CashFlowSeriesChart`) |
| Brush selection (drag-to-zoom on the chart itself) | Built (Recharts `<Brush>` on `CashFlowSeriesChart`'s full view, mapped back to a custom `TimeRangeValue` via `onRangeSelect`) |
| Drill-down (inline, within the page) | Built (clicking a category row in `CategoryBreakdownChart` expands its matching transactions inline) |
| Drill-down (cross-page, into a pre-filtered `/transactions`) | Backlog, needs sign-off (touches a shipped page outside this feature's boundary) |
| Pixel zoom/pan | Backlog, needs a new library decision |
| Reduced motion | Built — every Recharts `Area`/`Bar`/`Line` across all chart components now takes `isAnimationActive={!reducedMotion}` via `useReducedMotion()`, consistent with `AnimatedCounter`'s existing snap-to-final-state contract |

---

## Performance strategy

- `DashboardProvider.refresh()` reruns the whole orchestrator from scratch on every call — `lib/visualization/cache.ts` exists (mirroring `lib/coach/cache.ts`) for future waves' more expensive aggregations (heatmap buckets, budget burn-rate series) to avoid recomputing on every refresh. The Wave 0-2 charts built so far are cheap enough (`useMemo`-keyed on `[transactions, window, comparison]`) not to need it yet.
- PNG/PDF export libraries are dynamically imported on click, not bundled into the initial `/analytics` page load.
- Virtualization remains deferred — not needed at this feature's real data volumes.

---

## Wave history (all built)

| Wave | Scope | Key files |
|---|---|---|
| 0 | Visualization engine foundations | `lib/visualization/{types,engine,aggregator,statistics,comparison,formatter,cache,filterPreferences}.ts` |
| 1 | Chart chrome primitives + CSV/PNG/PDF/Print export | `components/charts/{ChartCard,FinancialTooltip,ChartLegend,ChartFilters,TimeRangeSelector,ComparisonSelector,ChartExport,ChartEmptyState,ChartLoadingState}.tsx` |
| 2 | Core `/analytics` page: Overview, Cash Flow, Categories | `app/(app)/analytics/page.tsx`, `components/analytics/AnalyticsPageContent.tsx`, `CashFlowSeriesChart.tsx`, `CategoryBreakdownChart.tsx` |
| 3 | Budgets/Forecast/Recurring depth | `BudgetProgressChart.tsx`, `BudgetBurnRateChart.tsx`, `ForecastProjectionChart.tsx`, `RecurringTimelineChart.tsx` |
| 4 | Merchants + heatmaps | `TopEntitiesChart.tsx`, `CalendarHeatmap.tsx`, `bucketByDay`/`bucketByDayOfWeek` |
| 5 | Data Sources + AI + Timeline | `ConnectionActivityChart.tsx`, `ImportSourcesChart.tsx`, `EventsTimelineChart.tsx` |
| 6 | Annotations layer | `lib/visualization/annotations.ts`, `AnnotationMarker.tsx` |
| 7 | Interaction polish | Brush → custom range on `CashFlowSeriesChart`; inline drill-down on `CategoryBreakdownChart` |
| 8 | Accessibility & performance pass | `isAnimationActive={!reducedMotion}` across every chart's Recharts elements; full test/typecheck/build verification |

## Remaining backlog (genuinely out of scope, not a missed wave)

- Cross-page drill-down into a pre-filtered `/transactions` (needs sign-off — touches a shipped page)
- Pixel zoom/pan (needs a new library decision)
- Full Report generation, Share, "Vacation Spending" annotation, rich multi-day Forecast curve, historical Forecast Confidence trend, `@tanstack/react-virtual` — see "Explicitly out of scope" above
