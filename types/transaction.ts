export const PAYMENT_METHODS = [
  "UPI",
  "Debit Card",
  "Credit Card",
  "Cash",
  "Net Banking",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Travel",
  "Salary",
  "Transfer",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type ClassificationSource = "memory" | "classifier";

export interface Transaction {
  id: string;
  amount: number;
  note: string;
  paymentMethod: PaymentMethod;
  aiCategory?: string;
  confidence?: number;
  classificationSource?: ClassificationSource;
  userCategory?: Category;
  reviewed: boolean;
  date: string; // "YYYY-MM-DD", local calendar date
  createdAt: string; // full ISO 8601 timestamp, sort tiebreaker
}
