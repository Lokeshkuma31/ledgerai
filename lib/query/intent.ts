import { CATEGORIES } from "@/types/transaction";
import type {
  AmountComparison,
  AmountEntity,
  DateRangeEntity,
  DetectedQuery,
  QueryEntities,
  QueryIntent,
} from "@/types/query";

/**
 * Priority-ordered keyword rules — checked top to bottom, first match
 * wins. More specific intents are listed before generic ones so, e.g.,
 * "budget" is caught before a generic "spending" match.
 */
const INTENT_KEYWORDS: [QueryIntent, string[]][] = [
  ["workflow-status", ["workflow", "workflows", "automation", "last run", "last refresh"]],
  ["budget-status", ["budget", "over budget", "on track", "exceed"]],
  [
    "cash-flow-forecast",
    ["forecast", "safe to spend", "safely spend", "projected", "month-end", "cash flow", "end of month"],
  ],
  ["recurring-payments", ["recurring", "subscription", "subscriptions"]],
  ["financial-events", ["event", "events", "alert", "alerts", "happened"]],
  ["recommendations", ["recommend", "suggestion", "suggest", "advice", "advise"]],
  [
    "general-summary",
    ["summary", "overview", "how am i doing", "how'm i doing", "how is my", "how's my"],
  ],
  [
    "transaction-search",
    ["biggest purchase", "largest purchase", "smallest purchase", "cheapest purchase", "show me", "list", "find"],
  ],
];

const MERCHANT_SPENDING_KEYWORDS = ["merchant", "merchants", "store", "vendor"];
const CATEGORY_SPENDING_KEYWORDS = ["category", "categories"];

const DATE_RANGE_PATTERNS: { pattern: RegExp; resolve: (now: Date, match: RegExpExecArray) => DateRangeEntity }[] =
  [
    {
      pattern: /\btoday\b/,
      resolve: (now) => dayRange(now, "Today"),
    },
    {
      pattern: /\byesterday\b/,
      resolve: (now) => dayRange(addDays(now, -1), "Yesterday"),
    },
    {
      pattern: /\bthis week\b/,
      resolve: (now) => weekRange(now, 0, "This Week"),
    },
    {
      pattern: /\blast week\b/,
      resolve: (now) => weekRange(now, -1, "Last Week"),
    },
    {
      pattern: /\bthis month\b/,
      resolve: (now) => monthRange(now.getFullYear(), now.getMonth(), "This Month"),
    },
    {
      pattern: /\blast month\b/,
      resolve: (now) => {
        const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return monthRange(year, month, "Last Month");
      },
    },
    {
      pattern: /\bthis year\b/,
      resolve: (now) => yearRange(now.getFullYear(), "This Year"),
    },
    {
      pattern: /\blast year\b/,
      resolve: (now) => yearRange(now.getFullYear() - 1, "Last Year"),
    },
    {
      pattern: /\blast (\d+) days\b/,
      resolve: (now, match) => {
        const days = Number(match[1]);
        return {
          label: `Last ${days} Days`,
          start: formatDate(addDays(now, -(days - 1))),
          end: formatDate(now),
        };
      },
    },
  ];

const AMOUNT_PATTERNS: { pattern: RegExp; comparison: AmountComparison }[] = [
  { pattern: /\bmore than\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "more-than" },
  { pattern: /\bover\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "more-than" },
  { pattern: /\babove\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "more-than" },
  { pattern: /\bless than\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "less-than" },
  { pattern: /\bunder\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "less-than" },
  { pattern: /\bbelow\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "less-than" },
  { pattern: /\bat least\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "at-least" },
  { pattern: /\bat most\s*[₹$]?\s*([\d,]+(?:\.\d+)?)/, comparison: "at-most" },
  { pattern: /[₹$]\s*([\d,]+(?:\.\d+)?)/, comparison: "exactly" },
];

const FREQUENCY_WORDS = ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"];

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayRange(date: Date, label: string): DateRangeEntity {
  const d = formatDate(date);
  return { label, start: d, end: d };
}

function weekRange(now: Date, weekOffset: number, label: string): DateRangeEntity {
  // Week starts Monday.
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = addDays(now, -dayOfWeek + weekOffset * 7);
  const sunday = addDays(monday, 6);
  return { label, start: formatDate(monday), end: formatDate(sunday) };
}

function monthRange(year: number, month: number, label: string): DateRangeEntity {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return {
    label,
    start: formatDate(new Date(year, month, 1)),
    end: formatDate(new Date(year, month, daysInMonth)),
  };
}

function yearRange(year: number, label: string): DateRangeEntity {
  return { label, start: `${year}-01-01`, end: `${year}-12-31` };
}

function extractDateRange(question: string, now: Date): DateRangeEntity | undefined {
  for (const { pattern, resolve } of DATE_RANGE_PATTERNS) {
    const match = pattern.exec(question);
    if (match) return resolve(now, match);
  }
  return undefined;
}

function extractAmount(question: string): AmountEntity | undefined {
  for (const { pattern, comparison } of AMOUNT_PATTERNS) {
    const match = pattern.exec(question);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount)) return { comparison, amount };
    }
  }
  return undefined;
}

function extractCategory(question: string): string | undefined {
  const lower = question.toLowerCase();
  return CATEGORIES.find((c) => lower.includes(c.toLowerCase()));
}

function extractMerchant(question: string, knownMerchantNames: string[]): string | undefined {
  const lower = question.toLowerCase();
  const sorted = [...knownMerchantNames].sort((a, b) => b.length - a.length);
  return sorted.find((name) => name.length > 0 && lower.includes(name.toLowerCase()));
}

function extractFrequency(question: string): string | undefined {
  const lower = question.toLowerCase();
  const word = FREQUENCY_WORDS.find((f) => lower.includes(f));
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : undefined;
}

export function extractEntities(
  question: string,
  knownMerchantNames: string[],
  now: Date = new Date(),
): QueryEntities {
  return {
    merchant: extractMerchant(question, knownMerchantNames),
    category: extractCategory(question),
    dateRange: extractDateRange(question, now),
    amount: extractAmount(question),
    frequency: extractFrequency(question),
  };
}

function matchIntentKeyword(lower: string): QueryIntent | undefined {
  for (const [intent, keywords] of INTENT_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return intent;
  }
  return undefined;
}

/**
 * Deterministic — no LLM classifies intent. Keyword matching first, then
 * falls back to whatever entities were actually extracted (a bare
 * merchant/category name with no other keywords still resolves sensibly).
 */
export function detectIntent(
  question: string,
  knownMerchantNames: string[],
  now: Date = new Date(),
): DetectedQuery {
  const lower = question.toLowerCase();
  const entities = extractEntities(question, knownMerchantNames, now);

  const keywordIntent = matchIntentKeyword(lower);
  if (keywordIntent) return { question, intent: keywordIntent, entities };

  if (MERCHANT_SPENDING_KEYWORDS.some((k) => lower.includes(k)) || entities.merchant) {
    return { question, intent: "merchant-spending", entities };
  }
  if (CATEGORY_SPENDING_KEYWORDS.some((k) => lower.includes(k)) || entities.category) {
    return { question, intent: "category-spending", entities };
  }
  if (entities.amount) {
    // An amount filter ("over ₹1000") only makes sense against specific
    // transactions — a general summary would just ignore it.
    return { question, intent: "transaction-search", entities };
  }
  if (lower.includes("spend") || lower.includes("spent") || lower.includes("cost")) {
    // A bare "how much did I spend" with no merchant/category/amount is
    // really asking for an overall picture.
    return { question, intent: "general-summary", entities };
  }

  return { question, intent: "unknown", entities };
}
