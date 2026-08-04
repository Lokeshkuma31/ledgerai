import { z } from "zod";

export const registerMerchantInputSchema = z.object({
  canonicalName: z.string().min(1),
  categoryHint: z.string().optional(),
  confidence: z.number().min(0).max(1),
  alias: z.string().optional(),
});
export type RegisterMerchantInput = z.infer<typeof registerMerchantInputSchema>;
