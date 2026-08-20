"use server";

/**
 * Support/feedback Server Action — the launch-checklist minimum from
 * docs/production-readiness-v2/08-launch-checklist.md's Support section
 * ("even a simple mailto or form"). Deliberately reuses existing
 * infrastructure (AuditLog's `after` JSON column, Pino) instead of adding a
 * new model/table or third-party ticketing integration — this is a beta-scale
 * capture mechanism, not a support desk. Follows the same
 * requireUserId -> rate-limit -> runActionTelemetry shape as
 * lib/connections/actions.ts, the only other Server Action module.
 */
import { requireUserId } from "@/lib/auth/session";
import { apiRateLimit } from "@/lib/cache/redis";
import { RateLimitedError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit/log";
import { logger } from "@/lib/observability/logger";
import { runActionTelemetry } from "@/lib/observability/telemetry";

export type FeedbackCategory = "bug" | "feedback" | "question";

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  diagnosticInfo?: string;
}

export async function submitFeedbackAction(input: SubmitFeedbackInput): Promise<{ ok: boolean; error?: string }> {
  return runActionTelemetry("submitFeedback", async () => {
    const userId = await requireUserId();

    const { success } = await apiRateLimit.limit(userId);
    if (!success) throw new RateLimitedError();

    const message = input.message.trim();
    if (!message) return { ok: false, error: "Please enter a message before sending." };
    if (message.length > 4000) return { ok: false, error: "Message is too long (4000 character limit)." };

    await recordAuditEvent({
      action: "support.feedback_submitted",
      entityType: "user",
      entityId: userId,
      userId,
      after: { category: input.category, message, diagnosticInfo: input.diagnosticInfo ?? null },
    });

    logger().info(
      { userId, category: input.category },
      "[support] feedback submitted — see AuditLog for content",
    );

    return { ok: true };
  });
}
