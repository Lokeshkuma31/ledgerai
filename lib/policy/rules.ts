import { pickDailyBriefingScheduleType } from "@/lib/policy/scheduler";
import type { FeedItem } from "@/types/feed";
import type {
  NotificationChannel,
  NotificationPreferences,
  PolicyCategory,
  PolicyDecision,
  ScheduleType,
} from "@/types/policy";

export interface RuleOutcome {
  decision: PolicyDecision;
  channels: NotificationChannel[];
  scheduleType: ScheduleType;
  reason: string;
  /** Which preference category gates this outcome — null means it's never
   * gated by a category toggle (only by cooldown/quiet-hours/rate-limit). */
  category: PolicyCategory | null;
  /** Short, stable identifier for which rule fired — feeds
   * PolicyStatistics' "Most Triggered Rule". */
  ruleName: string;
}

type Rule = (item: FeedItem, now: Date) => RuleOutcome | null;

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return (new Date(iso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
}

/** Budget exceeded -> Notify Immediately. */
const ruleBudgetExceeded: Rule = (item) => {
  if (item.type !== "budget-warning" || item.severity !== "critical") return null;
  return {
    decision: "notify-immediately",
    channels: ["push", "dashboard-feed", "desktop"],
    scheduleType: "immediate",
    reason: "A budget has been exceeded — this needs immediate attention.",
    category: "budgetAlerts",
    ruleName: "budget-exceeded",
  };
};

/** Negative cash flow forecast -> Notify Immediately. */
const ruleNegativeCashFlow: Rule = (item) => {
  const isNegativeForecast =
    (item.type === "cash-flow-change" || item.type === "forecast-update") && item.severity === "warning";
  if (!isNegativeForecast) return null;
  return {
    decision: "notify-immediately",
    channels: ["push", "dashboard-feed"],
    scheduleType: "immediate",
    reason: "The cash flow forecast has turned negative.",
    category: "forecastAlerts",
    ruleName: "negative-cash-flow",
  };
};

/** Salary expected tomorrow -> Dashboard Feed, Include In Daily Briefing. */
const ruleSalaryExpectedSoon: Rule = (item, now) => {
  if (item.type !== "salary-expected") return null;
  const days = daysUntil(item.expiresAt, now);
  if (days === null || days > 1) return null;
  return {
    decision: "include-in-daily-briefing",
    channels: ["dashboard-feed"],
    scheduleType: pickDailyBriefingScheduleType(now),
    reason: "Income is expected within a day.",
    category: "forecastAlerts",
    ruleName: "salary-expected-soon",
  };
};

/** Subscription renewal in 5 days -> Include In Daily Briefing. */
const ruleSubscriptionRenewalSoon: Rule = (item, now) => {
  if (item.type !== "subscription-renewal") return null;
  const days = daysUntil(item.expiresAt, now);
  if (days === null || days > 5) return null;
  return {
    decision: "include-in-daily-briefing",
    channels: ["dashboard-feed"],
    scheduleType: pickDailyBriefingScheduleType(now),
    reason: "A subscription renews within 5 days.",
    category: "subscriptionAlerts",
    ruleName: "subscription-renewal-soon",
  };
};

/** Positive savings milestone -> Dashboard Feed, Include In Weekly Summary. */
const ruleSavingsMilestone: Rule = (item) => {
  if (item.type !== "savings-milestone") return null;
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "weekly-summary",
    reason: "A positive savings milestone — good news, not urgent.",
    category: "achievements",
    ruleName: "savings-milestone",
  };
};

/** Other positive milestones (achievements, a recovered budget). */
const ruleAchievement: Rule = (item) => {
  if (item.type !== "achievement" && item.type !== "budget-recovered") return null;
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "weekly-summary",
    reason: "A positive milestone — surfaced in the weekly summary rather than interrupting.",
    category: "achievements",
    ruleName: "achievement",
  };
};

/** Merchant spending trend -> Include In Weekly Summary. */
const ruleMerchantOrCategoryTrend: Rule = (item) => {
  if (item.type !== "merchant-insight" && item.type !== "category-trend") return null;
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "weekly-summary",
    reason: "A merchant or category spending trend is worth a weekly look, not an interruption.",
    category: "merchantInsights",
    ruleName: "merchant-or-category-trend",
  };
};

/** The feed's own weekly-summary item batches into the weekly digest. */
const ruleWeeklySummaryItem: Rule = (item) => {
  if (item.type !== "weekly-summary") return null;
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "weekly-summary",
    reason: "This is itself a weekly summary item.",
    category: "weeklyDigest",
    ruleName: "weekly-summary-item",
  };
};

/** The feed's own monthly-summary item batches into the monthly digest.
 * PolicyDecision has no distinct "monthly" tier, so it shares
 * "include-in-weekly-summary" (the generic "batched digest" decision) —
 * scheduleType is what actually routes it to the monthly cadence. */
const ruleMonthlySummaryItem: Rule = (item) => {
  if (item.type !== "monthly-summary") return null;
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "monthly-summary",
    reason: "This is itself a monthly summary item.",
    category: "monthlyDigest",
    ruleName: "monthly-summary-item",
  };
};

/** Decision Engine recommendations — not gated by any single category
 * toggle, since they can relate to budget, spending, or savings alike. */
const ruleRecommendation: Rule = (item, now) => {
  if (item.type !== "recommendation") return null;
  if (item.severity === "critical") {
    return {
      decision: "notify-immediately",
      channels: ["push", "dashboard-feed"],
      scheduleType: "immediate",
      reason: "A critical recommendation needs prompt action.",
      category: null,
      ruleName: "recommendation-critical",
    };
  }
  if (item.severity === "important") {
    return {
      decision: "include-in-daily-briefing",
      channels: ["dashboard-feed"],
      scheduleType: pickDailyBriefingScheduleType(now),
      reason: "An important recommendation, surfaced in your next briefing.",
      category: null,
      ruleName: "recommendation-important",
    };
  }
  return {
    decision: "include-in-weekly-summary",
    channels: ["dashboard-feed"],
    scheduleType: "weekly-summary",
    reason: "A lower-priority recommendation, worth a weekly look.",
    category: null,
    ruleName: "recommendation-general",
  };
};

/** Minor spending fluctuation -> Silent. Anything more severe than "info"
 * still deserves a briefing mention. */
const ruleUnusualSpending: Rule = (item, now) => {
  if (item.type !== "unusual-spending") return null;
  if (item.severity === "info") {
    return {
      decision: "silent",
      channels: [],
      scheduleType: "custom",
      reason: "A minor spending fluctuation — not worth interrupting for.",
      category: null,
      ruleName: "minor-fluctuation",
    };
  }
  return {
    decision: "include-in-daily-briefing",
    channels: ["dashboard-feed"],
    scheduleType: pickDailyBriefingScheduleType(now),
    reason: "Unusual spending detected — surfaced in your next briefing.",
    category: null,
    ruleName: "unusual-spending",
  };
};

/** Catch-all — always matches, so it must stay last. Keeps the feed's
 * remaining item types (large-expense, new-subscription, salary-received,
 * system-insight, and anything future) from falling through unhandled. */
const ruleDefault: Rule = (item, now) => {
  if (item.priority >= 60) {
    return {
      decision: "include-in-daily-briefing",
      channels: ["dashboard-feed"],
      scheduleType: pickDailyBriefingScheduleType(now),
      reason: "General insight worth a look in your next briefing.",
      category: null,
      ruleName: "general-insight",
    };
  }
  return {
    decision: "silent",
    channels: [],
    scheduleType: "custom",
    reason: "Low-priority insight — kept in the feed but not surfaced elsewhere.",
    category: null,
    ruleName: "general-insight-low-priority",
  };
};

const RULES: Rule[] = [
  ruleBudgetExceeded,
  ruleNegativeCashFlow,
  ruleSalaryExpectedSoon,
  ruleSubscriptionRenewalSoon,
  ruleSavingsMilestone,
  ruleAchievement,
  ruleMerchantOrCategoryTrend,
  ruleWeeklySummaryItem,
  ruleMonthlySummaryItem,
  ruleRecommendation,
  ruleUnusualSpending,
  ruleDefault,
];

/** Deterministic, pure TypeScript — no React, no LLM. First matching rule
 * wins; ruleDefault always matches, so this never falls through unhandled. */
export function evaluateRules(item: FeedItem, now: Date): RuleOutcome {
  for (const rule of RULES) {
    const outcome = rule(item, now);
    if (outcome) return outcome;
  }
  return {
    decision: "silent",
    channels: [],
    scheduleType: "custom",
    reason: "No rule matched.",
    category: null,
    ruleName: "unmatched",
  };
}

/** Downgrades an outcome to Silent when the user has disabled the
 * preference category it's gated by — applied after evaluateRules, before
 * cooldown/quiet-hours, so a disabled category never even reaches
 * cooldown bookkeeping. */
export function applyPreferenceGate(
  outcome: RuleOutcome,
  preferences: NotificationPreferences,
): RuleOutcome {
  if (!outcome.category || preferences[outcome.category]) return outcome;
  return {
    ...outcome,
    decision: "silent",
    channels: [],
    reason: `${outcome.reason} (suppressed — this category is disabled in your notification preferences.)`,
  };
}
