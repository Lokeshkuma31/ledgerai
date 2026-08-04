import { z } from "zod";

export const goalInputSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  icon: z.string().min(1),
  color: z.string().min(1),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const updateGoalInputSchema = z.object({
  id: z.string().min(1),
  patch: goalInputSchema.partial(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalInputSchema>;
