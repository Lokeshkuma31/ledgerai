import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/src/generated/prisma/client";
import { withSpan } from "@/lib/observability/tracing";
import { recordDbLatency } from "@/lib/observability/metrics";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Query-timing/tracing instrumentation — added as a client extension
 * ($extends) rather than the removed $use middleware (Prisma 7). This is
 * the ONLY place database activity is instrumented; every one of
 * repositories/*.ts's ~15+ files keeps calling prisma.model.method()
 * unchanged. See docs/observability/04-tracing-strategy.md's Prisma
 * section. Never includes query args in span attributes or logs — model
 * + operation + duration only (docs/observability/08-privacy-review.md).
 *
 * Cast back to the plain PrismaClient type on the way out: $extends's
 * `query` component only wraps existing methods (adds no new fields/
 * models), so at runtime the extended client is behaviorally identical
 * to the plain one — but its *type* carries extension-branded generics
 * that aren't structurally assignable to `Prisma.TransactionClient`,
 * which several repositories/*.ts files already use to type a
 * `prisma.$transaction(async (tx) => ...)` callback's `tx` parameter.
 * Casting here preserves that existing typing everywhere instead of
 * rippling a fix out to every repository that opens a transaction.
 */
function withObservability(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: "observability",
    query: {
      async $allOperations({ model, operation, args, query }) {
        const label = model ?? "raw";
        return withSpan(`prisma.${label}.${operation}`, { "db.system": "postgresql", "db.model": label, "db.action": operation }, async (span) => {
          const start = Date.now();
          let failed = false;
          try {
            return await query(args);
          } catch (error) {
            failed = true;
            throw error;
          } finally {
            const durationMs = Date.now() - start;
            span.setAttribute("db.duration_ms", durationMs);
            recordDbLatency(label, operation, durationMs, failed);
          }
        });
      },
    },
  }) as unknown as PrismaClient;
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return withObservability(new PrismaClient({ adapter }));
}

// Reuse the client across hot reloads in dev and across warm serverless
// invocations in production (Fluid Compute keeps the module scope alive
// between requests on the same instance) — avoids exhausting Neon's
// pooled-connection limit by creating a fresh client per request.
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
