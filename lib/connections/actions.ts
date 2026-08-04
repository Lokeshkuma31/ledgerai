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
import { checkAndRecordHealth, disconnectConnection, refreshConnection, renameConnection } from "@/lib/connections/engine";
import type { ConnectionRecord } from "@/lib/connections/types";

export async function disconnectConnectionAction(id: string): Promise<ConnectionRecord | undefined> {
  const result = await disconnectConnection(id);
  revalidatePath("/connections");
  return result;
}

export async function refreshConnectionAction(id: string): Promise<{ record?: ConnectionRecord; error?: string }> {
  try {
    const record = await refreshConnection(id);
    revalidatePath("/connections");
    return { record };
  } catch (error) {
    revalidatePath("/connections");
    return { error: error instanceof Error ? error.message : "Refresh failed." };
  }
}

export async function renameConnectionAction(id: string, displayName: string): Promise<ConnectionRecord | undefined> {
  const result = await renameConnection(id, displayName);
  revalidatePath("/connections");
  return result;
}

export async function checkConnectionHealthAction(id: string): Promise<ConnectionRecord | undefined> {
  const result = await checkAndRecordHealth(id);
  revalidatePath("/connections");
  return result;
}
