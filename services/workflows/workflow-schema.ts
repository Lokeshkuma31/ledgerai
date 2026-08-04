import { z } from "zod";
import { WORKFLOW_ENGINES } from "@/types/workflow";

const workflowStepSchema = z.object({
  id: z.string().min(1),
  engine: z.enum(WORKFLOW_ENGINES),
  action: z.string().min(1),
  label: z.string().min(1),
});

export const updateWorkflowInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  steps: z.array(workflowStepSchema).optional(),
  priority: z.number().min(0).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowInputSchema>;
