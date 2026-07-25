export interface ClassificationResult {
  category: string;
  confidence: number;
}

const KEYWORD_RULES: Record<string, string[]> = {
  Food: [
    "coffee",
    "tea",
    "restaurant",
    "zomato",
    "swiggy",
    "breakfast",
    "lunch",
    "dinner",
    "pizza",
    "burger",
    "snacks",
  ],
  Transport: [
    "uber",
    "ola",
    "rapido",
    "fuel",
    "petrol",
    "diesel",
    "bus",
    "metro",
    "train",
    "cab",
    "taxi",
  ],
  Shopping: [
    "amazon",
    "flipkart",
    "mall",
    "shopping",
    "clothes",
    "shirt",
    "shoes",
    "store",
  ],
  Bills: [
    "electricity",
    "water",
    "wifi",
    "internet",
    "recharge",
    "bill",
    "gas",
  ],
  Entertainment: ["movie", "netflix", "spotify", "game", "gaming", "concert"],
  Health: ["hospital", "doctor", "medicine", "medical", "pharmacy", "clinic"],
  Education: ["course", "book", "udemy", "coursera", "fees", "college", "exam"],
  Travel: ["flight", "hotel", "trip", "vacation", "booking"],
  Salary: ["salary", "paycheck", "income"],
  Transfer: ["friend", "transfer", "upi transfer", "bank transfer"],
};

const MATCH_CONFIDENCE = 0.95;
const DEFAULT_CONFIDENCE = 0.4;
const DEFAULT_CATEGORY = "Other";

export function classifyTransaction(note: string): ClassificationResult {
  const normalized = note.toLowerCase();
  for (const [category, keywords] of Object.entries(KEYWORD_RULES)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return { category, confidence: MATCH_CONFIDENCE };
    }
  }
  return { category: DEFAULT_CATEGORY, confidence: DEFAULT_CONFIDENCE };
}
