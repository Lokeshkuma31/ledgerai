import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS } from "@/types/transaction";

export const transactionInputSchema = z.object({
  id: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  createdAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  aiCategory: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  classificationSource: z.enum(["memory", "classifier"]).optional(),
  userCategory: z.enum(CATEGORIES).optional(),
  reviewed: z.boolean(),
  merchantId: z.string().optional(),
  merchantName: z.string().optional(),
  merchantConfidence: z.number().min(0).max(1).optional(),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const reviewTransactionInputSchema = z.object({
  id: z.string().min(1),
  userCategory: z.enum(CATEGORIES).optional(),
});
export type ReviewTransactionInput = z.infer<typeof reviewTransactionInputSchema>;
