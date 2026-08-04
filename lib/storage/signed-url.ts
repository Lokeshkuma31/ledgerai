import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/storage/r2";

const DEFAULT_EXPIRY_SECONDS = 15 * 60;

/** For the document upload Route Handler (plan §5, §9) — the client PUTs
 * the file bytes directly to R2 using this URL, so the file never streams
 * through a Next.js server function. */
export async function createUploadUrl(key: string, contentType: string, expiresIn = DEFAULT_EXPIRY_SECONDS): Promise<string> {
  const command = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(r2, command, { expiresIn });
}

/** For reading a document/receipt back (e.g. into the OCR pipeline, or a
 * "view original" link) without making the bucket public. */
export async function createDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRY_SECONDS): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

export function buildDocumentKey(organizationId: string, documentId: string, fileName: string): string {
  return `${organizationId}/documents/${documentId}/${fileName}`;
}
