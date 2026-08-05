"use server";

/**
 * Server Actions — the only way a Client Component mutates a connection.
 * Every export here is a thin wrapper around engine.ts; none of them
 * return anything but a ConnectionRecord (or nothing), so a token can
 * never leave the server through this boundary. Starting a new
 * connection is deliberately *not* here — that always begins with a real
 * HTTP redirect to the provider, which only a Route Handler
 * (app/api/connections/[provider]/authorize/route.ts) can issue; a plain
 * link to that route is the "Connect"/"Reconnect" button's href.
 */
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { connectionMutationRateLimit } from "@/lib/cache/redis";
import { RateLimitedError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit/log";
import { checkAndRecordHealth, disconnectConnection, refreshConnection, renameConnection } from "@/lib/connections/engine";
import type { ConnectionRecord } from "@/lib/connections/types";

// Every action below resolves+authenticates the caller (requireUserId())
// before doing anything else, then passes that id into engine.ts so it can
// enforce that the connection being mutated actually belongs to them (see
// docs/security-hardening/03-idor-verification-report.md, Finding 1 — these
// four actions previously took a bare `id` with no session check at all).
// A thrown UnauthorizedError/ForbiddenError from requireUserId()/engine.ts
// propagates to the client the same way any other engine error already
// does; components/ProviderCard.tsx's existing withBusy() catch already
// surfaces it as a visible error message, so no UI change is needed here.
//
// Each action is also rate-limited here, directly — Server Actions never
// match middleware.ts's /api/* prefix, so without this they'd bypass rate
// limiting entirely (see docs/security-hardening/05-rate-limiting-strategy.md).

async function guardMutationRate(userId: string): Promise<void> {
  const { success } = await connectionMutationRateLimit.limit(userId);
  if (!success) {
    await recordAuditEvent({ action: "security.rate_limited", entityType: "connection", entityId: userId, userId });
    throw new RateLimitedError();
  }
}

export async function disconnectConnectionAction(id: string): Promise<ConnectionRecord | undefined> {
  const userId = await requireUserId();
  await guardMutationRate(userId);
  const result = await disconnectConnection(id, userId);
  revalidatePath("/connections");
  return result;
}

export async function refreshConnectionAction(id: string): Promise<{ record?: ConnectionRecord; error?: string }> {
  try {
    const userId = await requireUserId();
    await guardMutationRate(userId);
    const record = await refreshConnection(id, userId);
    revalidatePath("/connections");
    return { record };
  } catch (error) {
    revalidatePath("/connections");
    return { error: error instanceof Error ? error.message : "Refresh failed." };
  }
}

export async function renameConnectionAction(id: string, displayName: string): Promise<ConnectionRecord | undefined> {
  const userId = await requireUserId();
  await guardMutationRate(userId);
  const result = await renameConnection(id, displayName, userId);
  revalidatePath("/connections");
  return result;
}

export async function checkConnectionHealthAction(id: string): Promise<ConnectionRecord | undefined> {
  const userId = await requireUserId();
  await guardMutationRate(userId);
  const result = await checkAndRecordHealth(id, userId);
  revalidatePath("/connections");
  return result;
}
