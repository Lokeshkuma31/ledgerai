import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentOrganizationId, getCurrentUserId } from "@/lib/auth/session";
import { getDocumentUploadUrl } from "@/services/documents/document-service";

export const runtime = "nodejs";

// Matches plugins/document-intelligence's real-world document set
// (receipts/invoices/statements/bills as PDF or photographed/scanned
// images) — anything else is rejected before a presigned URL is ever
// issued.
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().refine((value) => ALLOWED_MIME_TYPES.has(value), {
    message: `mimeType must be one of: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_SIZE_BYTES, `File exceeds the ${MAX_SIZE_BYTES / (1024 * 1024)}MB limit.`),
});

/**
 * Issues a presigned R2 upload URL for a new document — the client PUTs
 * file bytes directly to R2 with the returned URL, so the file never
 * streams through this server (see lib/storage/signed-url.ts). Explicit
 * size/content-type checks live here rather than in the service layer,
 * per the migration plan's API strategy (uploads are a Route Handler, not
 * a Server Action, specifically for this kind of validation plus
 * independent rate-limiting).
 */
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  const organizationId = await getCurrentOrganizationId();
  if (!userId || !organizationId) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required." } }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request." } },
      { status: 400 },
    );
  }

  const documentId = crypto.randomUUID();
  const { uploadUrl, r2Key } = await getDocumentUploadUrl(
    organizationId,
    documentId,
    parsed.data.fileName,
    parsed.data.mimeType,
  );

  return NextResponse.json({ documentId, uploadUrl, r2Key });
}
