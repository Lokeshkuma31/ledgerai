import { z } from "zod";
import { CATEGORIES } from "@/types/transaction";

export const addBudgetInputSchema = z.object({
  category: z.enum(CATEGORIES),
  monthlyLimit: z.number().positive(),
});
export type AddBudgetInput = z.infer<typeof addBudgetInputSchema>;

export const updateBudgetLimitInputSchema = z.object({
  id: z.string().min(1),
  monthlyLimit: z.number().positive(),
});
export type UpdateBudgetLimitInput = z.infer<typeof updateBudgetLimitInputSchema>;
