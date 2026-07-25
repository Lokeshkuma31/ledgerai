"use server";

import { generateText } from "@/lib/ai/provider";
import type { Insights } from "@/lib/insights/engine";
import type { TimelineGroup } from "@/lib/timeline/engine";
import type { Transaction } from "@/types/transaction";

export interface MemoryStats {
  totalEntries: number;
}

export interface ReviewStats {
  totalTransactions: number;
  reviewedCount: number;
  pendingCount: number;
}

export interface CoachInput {
  insights: Insights;
  timeline: TimelineGroup[];
  /** Last 10 transactions, newest first. */
  recentTransactions: Transaction[];
  memoryStats: MemoryStats;
  reviewStats: ReviewStats;
}

export interface CoachOutput {
  summary: string;
  goodHabits: string[];
  watchOutFor: string[];
  suggestions: string[];
}

function effectiveCategory(transaction: Transaction): string {
  return transaction.userCategory ?? transaction.aiCategory ?? "Other";
}

function buildAnalyticsPayload(input: CoachInput) {
  return {
    totalSpent: input.insights.totalSpent,
    transactionCount: input.insights.totalTransactions,
    categoryBreakdown: input.insights.categoryBreakdown.map((entry) => ({
      category: entry.category,
      total: entry.total,
      percentage: Math.round(entry.percentage * 10) / 10,
    })),
    timelineSummary: input.timeline.map((group) => ({
      period: group.label,
      totalAmount: group.totalAmount,
      transactionCount: group.transactionCount,
    })),
    largestExpense: input.insights.largestExpense,
    mostUsedCategory: input.insights.topCategory,
    mostUsedPaymentMethod: input.insights.topPaymentMethod,
    averageExpense: input.insights.averageExpense,
    recentTransactions: input.recentTransactions.slice(0, 10).map((t) => ({
      amount: t.amount,
      category: effectiveCategory(t),
      paymentMethod: t.paymentMethod,
      date: t.date,
    })),
    memoryLayer: {
      rememberedMappingCount: input.memoryStats.totalEntries,
    },
    review: {
      totalTransactions: input.reviewStats.totalTransactions,
      reviewedCount: input.reviewStats.reviewedCount,
      pendingCount: input.reviewStats.pendingCount,
    },
  };
}

function buildPrompt(analytics: ReturnType<typeof buildAnalyticsPayload>): string {
  return [
    "You are a financial coach analyzing a user's already-categorized spending data.",
    "Do not classify or re-categorize transactions — categorization is already finalized upstream.",
    "Your job is only to explain spending patterns and give personalized, actionable financial advice based on the structured analytics below.",
    "",
    "Analytics (JSON):",
    JSON.stringify(analytics),
    "",
    "Respond with ONLY a single JSON object, no markdown, no code fences, no commentary outside the JSON, matching exactly this shape:",
    '{"summary": string, "goodHabits": string[], "watchOutFor": string[], "suggestions": string[]}',
    "- summary: a short, plain-language paragraph explaining the person's overall spending behavior.",
    "- goodHabits: positive patterns worth reinforcing.",
    "- watchOutFor: concerning patterns or risks.",
    "- suggestions: concrete, actionable recommendations.",
  ].join("\n");
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseCoachResponse(raw: string): CoachOutput {
  const parsed: unknown = JSON.parse(stripCodeFence(raw));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Coach response was not a JSON object");
  }
  const { summary, goodHabits, watchOutFor, suggestions } = parsed as Record<
    string,
    unknown
  >;
  if (
    typeof summary !== "string" ||
    !isStringArray(goodHabits) ||
    !isStringArray(watchOutFor) ||
    !isStringArray(suggestions)
  ) {
    throw new Error("Coach response did not match the expected shape");
  }
  return { summary, goodHabits, watchOutFor, suggestions };
}

export async function generateFinancialSummary(
  input: CoachInput,
): Promise<CoachOutput> {
  const analytics = buildAnalyticsPayload(input);
  const prompt = buildPrompt(analytics);
  const raw = await generateText(prompt);
  return parseCoachResponse(raw);
}
