import type { MerchantKnowledge } from "@/types/merchant-profile";

interface KnowledgeRule extends MerchantKnowledge {
  /** Lowercase canonical names this rule applies to. */
  canonicalNames: string[];
}

/**
 * The single, centralized table of merchant knowledge. Every deterministic
 * fact about a merchant's industry, type, tags, and behavior lives here —
 * nowhere else in the app should hardcode merchant-specific logic.
 */
const KNOWLEDGE_RULES: KnowledgeRule[] = [
  {
    canonicalNames: ["amazon"],
    industry: "E-Commerce",
    merchantType: "Marketplace",
    defaultCategory: "Shopping",
    subcategories: ["General Retail"],
    tags: ["Marketplace", "Online"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["flipkart"],
    industry: "E-Commerce",
    merchantType: "Marketplace",
    defaultCategory: "Shopping",
    subcategories: ["General Retail"],
    tags: ["Marketplace", "Online"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["swiggy"],
    industry: "Food Delivery",
    merchantType: "Delivery Service",
    defaultCategory: "Food",
    subcategories: ["Restaurant Delivery"],
    tags: ["Delivery", "Restaurant"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["zomato"],
    industry: "Food Delivery",
    merchantType: "Delivery Service",
    defaultCategory: "Food",
    subcategories: ["Restaurant Delivery"],
    tags: ["Delivery", "Restaurant"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["uber"],
    industry: "Transportation",
    merchantType: "Ride Sharing",
    defaultCategory: "Transport",
    subcategories: ["Cab Booking"],
    tags: ["Ride Sharing"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["ola"],
    industry: "Transportation",
    merchantType: "Ride Sharing",
    defaultCategory: "Transport",
    subcategories: ["Cab Booking"],
    tags: ["Ride Sharing"],
    isOnline: true,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["starbucks"],
    industry: "Food & Beverage",
    merchantType: "Cafe",
    defaultCategory: "Food",
    subcategories: ["Coffee Shop"],
    tags: ["Cafe"],
    isOnline: false,
    isRecurringFriendly: false,
  },
  {
    canonicalNames: ["netflix"],
    industry: "Entertainment",
    merchantType: "Streaming Service",
    defaultCategory: "Entertainment",
    subcategories: ["Video Streaming"],
    tags: ["Streaming", "Subscription"],
    isOnline: true,
    isRecurringFriendly: true,
  },
  {
    canonicalNames: ["electric company"],
    industry: "Utilities",
    merchantType: "Utility Provider",
    defaultCategory: "Bills",
    subcategories: ["Electricity"],
    tags: ["Utility"],
    isOnline: false,
    isRecurringFriendly: true,
  },
  {
    canonicalNames: ["spotify"],
    industry: "Entertainment",
    merchantType: "Streaming Service",
    defaultCategory: "Entertainment",
    subcategories: ["Music Streaming"],
    tags: ["Streaming", "Subscription"],
    isOnline: true,
    isRecurringFriendly: true,
  },
  {
    canonicalNames: ["gym membership", "gym"],
    industry: "Health & Fitness",
    merchantType: "Membership",
    defaultCategory: "Health",
    subcategories: ["Fitness"],
    tags: ["Fitness", "Subscription"],
    isOnline: false,
    isRecurringFriendly: true,
  },
];

const FALLBACK_KNOWLEDGE: Omit<MerchantKnowledge, "defaultCategory"> = {
  industry: "General",
  merchantType: "Unknown",
  subcategories: [],
  tags: [],
  isOnline: false,
  isRecurringFriendly: false,
};

/**
 * Looks up deterministic knowledge for a canonical merchant name. Unknown
 * merchants get a neutral fallback profile rather than a guess — their
 * `defaultCategory` falls back to whatever category hint the Merchant
 * Intelligence Engine already extracted, or "Other" if none exists.
 */
export function lookupKnowledge(
  canonicalName: string,
  categoryHintFallback?: string,
): MerchantKnowledge {
  const lower = canonicalName.trim().toLowerCase();
  const rule = KNOWLEDGE_RULES.find((r) => r.canonicalNames.includes(lower));
  if (rule) {
    return {
      industry: rule.industry,
      merchantType: rule.merchantType,
      defaultCategory: rule.defaultCategory,
      subcategories: rule.subcategories,
      tags: rule.tags,
      country: rule.country,
      isOnline: rule.isOnline,
      isRecurringFriendly: rule.isRecurringFriendly,
    };
  }
  return {
    ...FALLBACK_KNOWLEDGE,
    defaultCategory: categoryHintFallback ?? "Other",
  };
}
