import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOrganizationId, getCurrentUserId } from "@/lib/auth/session";
import { uploadRateLimit } from "@/lib/cache/redis";
import { recordAuditEvent } from "@/lib/audit/log";
import { dispatch } from "@/lib/jobs/dispatcher";
import { buildKey } from "@/lib/jobs/idempotency";

export const runtime = "nodejs";

const confirmRequestSchema = z.object({
  r2Key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

/**
 * Called by the client once its direct-to-R2 PUT (using the presigned URL
 * from POST /api/documents/upload) has completed — the missing "kick off
 * processing" step the codebase never had (see
 * docs/job-platform/09-migration-plan.md's Document processing row).
 * Dispatches ledger/document.uploaded; the document-parse background job
 * creates the actual Document row once analysis has run (see
 * lib/jobs/functions/documents.ts), not this route — mirrors
 * plugins/document-intelligence/pipeline.ts's analyze-before-record order.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;

  const userId = await getCurrentUserId();
  const organizationId = await getCurrentOrganizationId();
  if (!userId || !organizationId) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
  }

  const { success } = await uploadRateLimit.limit(userId);
  if (!success) {
    await recordAuditEvent({ action: "security.rate_limited", entityType: "document", entityId: userId, userId, organizationId });
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests — try again shortly." } }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 },
    );
  }

  await dispatch(
    "ledger/document.uploaded",
    {
      organizationId,
      documentId,
      r2Key: parsed.data.r2Key,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
    },
    { id: buildKey("document-uploaded", documentId) },
  );

  await recordAuditEvent({
    action: "document.upload_confirmed",
    entityType: "document",
    entityId: documentId,
    userId,
    organizationId,
  });

  return NextResponse.json({ documentId, status: "queued" });
}
