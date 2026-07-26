export interface NormalizedMerchant {
  canonicalName: string;
  categoryHint?: string;
}

interface MerchantRule {
  canonicalName: string;
  categoryHint?: string;
  /** Lowercase substrings that identify this merchant in free text. */
  aliases: string[];
}

/**
 * Known merchant variations, mapped to a single canonical identity. This is
 * the only place merchant-name rules live — extraction and the registry
 * stay ignorant of specific brands.
 */
const MERCHANT_RULES: MerchantRule[] = [
  {
    canonicalName: "Amazon",
    categoryHint: "Shopping",
    aliases: [
      "amazon seller services",
      "amazon pay",
      "amazon india",
      "amzn",
      "amazon",
    ],
  },
  {
    canonicalName: "Swiggy",
    categoryHint: "Food",
    aliases: ["swiggy instamart", "swiggy ltd", "swiggy"],
  },
  {
    canonicalName: "Uber",
    categoryHint: "Transport",
    aliases: ["uber trip", "uber bv", "uber"],
  },
  {
    canonicalName: "Starbucks",
    categoryHint: "Food",
    aliases: ["starbucks"],
  },
  {
    canonicalName: "Flipkart",
    categoryHint: "Shopping",
    aliases: ["flipkart"],
  },
  {
    canonicalName: "Zomato",
    categoryHint: "Food",
    aliases: ["zomato"],
  },
  {
    canonicalName: "Netflix",
    categoryHint: "Entertainment",
    aliases: ["netflix"],
  },
  {
    canonicalName: "Ola",
    categoryHint: "Transport",
    aliases: ["ola cabs", "ola"],
  },
];

// Longest alias first so a specific variant ("amazon pay") is matched before
// a shorter one that happens to be its own alias elsewhere ("amazon").
const RULES_BY_ALIAS_LENGTH = [...MERCHANT_RULES].sort(
  (a, b) => Math.max(...b.aliases.map((s) => s.length)) - Math.max(...a.aliases.map((s) => s.length)),
);

function cleanCandidate(raw: string): string {
  return raw
    .trim()
    .replace(/[.,!?'"]+$/, "")
    .replace(/\s+/g, " ");
}

function titleCase(raw: string): string {
  return cleanCandidate(raw)
    .split(" ")
    .map((word) =>
      word.length === 0
        ? word
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Scans free text (e.g. a full transaction note) for any known merchant
 * alias. Returns the canonical identity of the first/most-specific match.
 */
export function matchKnownMerchant(text: string): NormalizedMerchant | undefined {
  const lower = text.toLowerCase();
  for (const rule of RULES_BY_ALIAS_LENGTH) {
    if (rule.aliases.some((alias) => lower.includes(alias))) {
      return { canonicalName: rule.canonicalName, categoryHint: rule.categoryHint };
    }
  }
  return undefined;
}

/**
 * Normalizes an already-extracted merchant candidate (e.g. "AMZN" or
 * "Swiggy Instamart") into its canonical identity. Unknown candidates fall
 * back to a title-cased version of themselves — every merchant becomes its
 * own canonical identity even without a hand-written rule.
 */
export function normalizeMerchantName(candidate: string): NormalizedMerchant {
  const lower = candidate.trim().toLowerCase();
  for (const rule of RULES_BY_ALIAS_LENGTH) {
    if (rule.aliases.some((alias) => lower.includes(alias) || alias.includes(lower))) {
      return { canonicalName: rule.canonicalName, categoryHint: rule.categoryHint };
    }
  }
  return { canonicalName: titleCase(candidate) };
}
