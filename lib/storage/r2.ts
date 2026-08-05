import { S3Client } from "@aws-sdk/client-s3";
import { withExternalSpan } from "@/lib/observability/tracing";

declare global {
  // eslint-disable-next-line no-var
  var __r2: S3Client | undefined;
}

/** Wraps the single .send() method every call site (HeadBucketCommand in
 * checkStorage(), any PutObject/GetObject/HeadObject a route handler
 * issues) goes through, so no individual call site needs its own span —
 * see docs/observability/04-tracing-strategy.md's R2 section. Patched
 * once per client instance, not per call. */
function instrumentR2Client(client: S3Client, bucket: string): S3Client {
  const originalSend = client.send.bind(client);
  client.send = ((command: { constructor: { name: string } }, ...rest: unknown[]) => {
    const commandName = command?.constructor?.name ?? "UnknownCommand";
    return withExternalSpan(`r2.${commandName}`, { "r2.command": commandName, "r2.bucket": bucket }, () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (originalSend as any)(command, ...rest),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return client;
}

function createR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set — create an R2 bucket + API token first.");
  }
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return instrumentR2Client(client, process.env.R2_BUCKET ?? "ledgerai-documents-dev");
}

export const r2 = globalThis.__r2 ?? createR2Client();

if (process.env.NODE_ENV !== "production") {
  globalThis.__r2 = r2;
}

export const R2_BUCKET = process.env.R2_BUCKET ?? "ledgerai-documents-dev";
